//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
pragma abicoder v2;

import {RedirectAll, ISuperToken, IConstantFlowAgreementV1, ISuperfluid} from "./RedirectAll.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import {TradeableFlowStorage} from "./TradeableFlowStorage.sol";

/*
NOTE: We do not use Ownable. The Ownable contract makes ownership mutable. 
Ownership is expected to remain fixed for the program as the owner address is the one receiving the revenue.
Changing the owner would cause serious issues with users creating/updating their flows.
*/

/// @author Drip Finance
/// @title Affiliate Cashflow NFT
contract TradeableFlow is ERC721, ERC721URIStorage, RedirectAll {

  using Strings for uint256;                                    // clever package which lets you cast uints to strings
  using Counters for Counters.Counter;
  Counters.Counter tokenIds;

  address public owner;                                         // Public owner address for visibility

  address public drip;                                          // sets address of Drip wallet
  int96 public dripSubscriptionRequirement;                     // sets the required rate the program owner must be paying
  ISuperToken public dripPaymentToken;                          // payment token that program owner uses to pay for using Drip

  address public ERC20MintRestrict;                             // ERC20 token for which you must have enough balance to mint TradeableFlow NFT
  uint256 public ERC20MintRestrictBalanceRequirement;           // Balance of ERC20 token required by wallet to mint TradeableFlow NFT - not set in constructor (so initially it's zero) but can be adjusted with setters

  string private baseURI;                                        // Base URI pointing to Drip asset database

  event NewAffiliateLink(uint indexed tokenId, address indexed affiliate);      // Emitted when a new affiliate link is created
  event newBaseURISet(string baseURI);
  event appLocked();

  constructor (
    address _owner,
    address _drip,
    string memory _name,
    string memory _symbol,
    string memory _baseURI,
    ISuperfluid host,
    IConstantFlowAgreementV1 cfa,
    int96 _affiliatePortion,
    string memory registrationKey
  )
    public ERC721 ( _name, _symbol )
    RedirectAll (
      host,
      cfa,
      _owner,
      registrationKey
     )
  { 
    _ap.affiliatePortion = _affiliatePortion;
    owner = _owner;
    drip = _drip;
    baseURI = _baseURI;
  }

  modifier hasEnoughERC20Restrict() {
    // Must own enough of the designated ERC20 token to mint an affiliate NFT
    if (ERC20MintRestrict != address(0)) {
      require(IERC20(ERC20MintRestrict).balanceOf(msg.sender) >= ERC20MintRestrictBalanceRequirement, "!bal"); 
    }
    _;
  }

  modifier onlyAuthorizedLocker() {
    require(msg.sender == drip || msg.sender == _ap.owner, "!auth");
    _;
  }

  /**
  @notice Mints the affiliate NFT
  @param referralCode URI, which also serves as referral code
  @return tokenId Token ID of minted affiliate NFT
  */
  function mint(string memory referralCode) external hasEnoughERC20Restrict returns (uint256 tokenId) {
    require(msg.sender != _ap.owner, "!own");                                     // Shouldn't be minting affiliate NFTs to contract deployer
    require(_ap.referralcodeToToken[referralCode] == 0, "!uri");                  // prevent minter from minting an NFT with the same affiliate code (tokenURI) as before to prevent affiliate flows from being stolen
    require(keccak256( bytes(referralCode) ) != keccak256( bytes("") ),"blank");  // We don't want to be minting an affiliate NFT with blank referral code

    tokenIds.increment();
    tokenId = tokenIds.current();

    _ap.tokenToReferralCode[tokenId] = referralCode;

    _mint(msg.sender,tokenId);

    // Set msg.sender as affiliate for the token
    _ap.tokenToAffiliate[tokenId] = msg.sender; 

    // Set referral code to corresponding token
    _ap.referralcodeToToken[referralCode] = tokenId;

    // Emit event that NFT was minted
    emit NewAffiliateLink(tokenId, msg.sender);

  }

  /**
  @notice Overrides tokenURI
  @param tokenId token ID of Drip NFT being queried
  @return token URI
  */
  function tokenURI(uint256 tokenId)
      public
      view
      override(ERC721, ERC721URIStorage)
      returns (string memory)
  {
      require(_exists(tokenId),"!exist");
      if (bytes(_baseURI()).length > 0) {
        return string(
              abi.encodePacked(
              _baseURI(),
              "/",
              tokenId.toString()
            )
          );
      } else {
        return "";
      }
  }

  /**
  @dev override for base URI
  @return the variable `baseURI`
  */
  function _baseURI() internal view override returns (string memory) {
      return baseURI;
  }

  /**
  @dev overriding _burn due duplication in inherited ERC721 and ERC721URIStorage
  */
  function _burn(uint256 tokenId) internal override(ERC721, ERC721URIStorage) {
      super._burn(tokenId);
  }

  /**
  @notice Token transfer callback - redirects existing flows to new affiliate
  @dev Redirects flows by calling _changeReceiver function in RedirectAll inheritance. NFT can't be transferred to owner
  @param from original affiliate
  @param to new affiliate
  @param tokenId token ID of affiliate NFT being transferred
  */
  function _beforeTokenTransfer(
    address from,
    address to,
    uint256 tokenId
  ) internal override {
    require(to != _ap.owner,"!own");
    if (from != address(0)) {
      _changeReceiver(from, to, tokenId);
    }
  }

  /**
  @notice Sets app to locked. If an owner locks their program, they must notify Drip!
  @notice Drip is allowed to lock the app at discretion as a consequence for not paying for the service
  @dev Setting to true blocks incoming streams and allows anyone to cancel incoming streams
  */
  function lock() external onlyAuthorizedLocker {
    _ap.locked = true;
    emit appLocked();
  }

  /**
  @notice Sets app to, only Drip can unlock to retain control over monetization
  @dev Setting to true blocks incoming streams and allows anyone to cancel incoming streams
  */
  function unlock() external {
    require(msg.sender == drip, "!drip");
    _ap.locked = false;
  }

  /**
  @notice Reset NFT base URIs
  @param newBaseURI new base URI to be used
  */
  function setBaseURI(string memory newBaseURI) external onlyOwner {
      baseURI = newBaseURI;
      emit newBaseURISet(newBaseURI);
  }

  /**
  @notice Allows owner to set minting restriction based on possession of specified balance of an ERC20 token.
  @param newERC20MintRestrictBalanceRequirement balance of ERC20 token needed to mint affiliate NFT
  @param newERC20MintRestrict ERC20 token required for minting
  */
  function setERC20MintRestriction(
    uint256 newERC20MintRestrictBalanceRequirement,
    address newERC20MintRestrict
  ) external onlyOwner {
    ERC20MintRestrict = newERC20MintRestrict;
    ERC20MintRestrictBalanceRequirement = newERC20MintRestrictBalanceRequirement;
  }

  /**
  @notice Allows owner to set new super token acceptable for payment in affiliate program.
  @dev Tokens CANNOT be unset as acceptable
  @param supertoken New super token to be accepted for payment

  IMPORTANT NOTE:
  - When setting new tokens, bear this in mind https://discord.com/channels/752490247643725875/752493348169711696/868658956162203671
  - Simply deposit 4-hours-of-a-100-times-a-max-expected-stream worth of supertoken into the contract to prevent contract malfunction
  */
  function setNewAcceptedToken(
    ISuperToken supertoken
  ) external onlyOwner {
    // Makeshift solution - if the address provided is not a super token, this will error out
    require(_ap.host == ISuperfluid(supertoken.getHost()),"!host");
    // Super token must have not already been set as a valid super token
    require(!_ap.acceptedTokens[supertoken],"alreadyset");

    _ap.acceptedTokensList.push(supertoken);
    _ap.acceptedTokens[supertoken] = true;
  }

  /**
  @notice Lets Drip set new monetization authority address
  @param newDrip Address of new monetization authority address
  */
  function setNewDripOwner(
    address newDrip
  ) external {
    require(msg.sender == drip,"!drip");
    drip = newDrip;
  }

  /**
  @notice gets token ID of affiliate NFT that a subscriber was referred with
  @param subscriber Address of subscriber whose associated affiliate NFT is to be discovered
  @return token ID of affiliate NFT associated with the subscriber
  */
  function getAffiliateTokenIdForSubscriber(address subscriber) external view returns (uint256) {
    return _ap.subscribers[subscriber].tokenId;
  }

  /**
  @notice Gets affiliate whose affiliate NFT was used by subscriber for referral
  @dev Links subscriber address to token ID and the to affiliate
  @param subscriber Address of subscriber whose associated affiliate is to be discovered
  @return address of affiliate associated with the subscriber
  */
  function getAffiliateForSubscriber(address subscriber) external view returns (address) {
    return _ap.tokenToAffiliate[_ap.subscribers[subscriber].tokenId];
  }

  /**
  @notice Gets the ERC20 balance requirement imposed on the minting of affiliate NFTs
  @return ERC20 balance requirement
  */
  function getERC20MintRestrictBalanceRequirement() external view returns (uint256) {
    return ERC20MintRestrictBalanceRequirement;
  }

  /**
  @notice Gets the address of ERC20 token needed for minting of affiliate NFTs
  @return Address of ERC20 token used for restriction
  */
  function getERC20MintRestrict() external view returns (address) {
    return ERC20MintRestrict;
  }

  /**
  @notice Gets the affiliate associated with an affiliate NFT via token ID
  @param tokenId The token ID of NFT who's associate affiliate is to be discovered
  @return Address of affiliate associated with tokenId
  */
  function getAffiliateFromTokenId(uint256 tokenId) external view returns (address) {
    return _ap.tokenToAffiliate[tokenId];
  }

  /**
  @notice Gets the token a subscriber is paying with
  @param subscriber Address of subscriber
  @return Address of super token the subscriber is paying with
  */
  function getSubscriberPaymentToken(address subscriber) external view returns (address) {
    return address(_ap.subscribers[subscriber].paymentToken);
  }

  /**
  @notice Gets array of accepted tokens
  @return Accepted token list
  */
  function getAcceptedTokensList() external view returns (ISuperToken[] memory) {
    return _ap.acceptedTokensList;
  }

  /**
  @notice Gets outflow associated with a cashflow NFT
  @param tokenId The token ID of NFT who's associated flow is to be discovered
  @param supertoken The supertoken of which the flow is in concern
  @return outflow rate
  */
  function getOutflowFromTokenId(uint256 tokenId, ISuperToken supertoken) external view returns (int96) {
    return _ap.tokenToPaymentTokentoOutflowRate[tokenId][supertoken];
  }

  /**
  @notice Gets token ID associated with a referral code
  @param referralCode The referral code whose associated token ID is in concern
  @return token ID
  */
  function getTokenIdFromAffiliateCode(string memory referralCode) external view returns (uint256) {
    return _ap.referralcodeToToken[referralCode];
  }

    /**
  @notice Gets referral associated with a token Id code
  @param tokenId The token ID whose referral code is in concern
  @return referral code
  */
  function getAffiliateCodeFromTokenId(uint256 tokenId) external view returns (string memory) {
    return _ap.tokenToReferralCode[tokenId];
  }

}