//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
pragma abicoder v2;

import {RedirectAll, ISuperToken, IConstantFlowAgreementV1, ISuperfluid} from "./RedirectAll.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import {TradeableFlowStorage} from "./TradeableFlowStorage.sol";

// NOTE: We do not use Ownable. The Ownable contract makes ownership mutable. Ownership is expected to 
//       remain fixed for the program as the owner address is the one receiving the revenue.
//       Changing the owner would cause serious issues with users creating/updating their flows

// Enforce that the owner cannot start a flow to the superapp
contract TradeableFlow is ERC721, ERC721URIStorage, RedirectAll {

  using Counters for Counters.Counter;
  Counters.Counter tokenIds;
  event NewAffiliateLink(uint tokenId, address affiliate);      // Emitted when a new affiliate link is created

  address public owner;                                   // Public owner address for visibility
  address public ERC20MintRestrict;                       // ERC20 token for which you must have enough balance to mint TradeableFlow NFT
  uint256 public ERC20MintRestrictBalanceRequirement;     // Balance of ERC20 token required by wallet to mint TradeableFlow NFT - not set in constructor (so initially it's zero) but with changeSettings()

  constructor (
    address _owner,
    string memory _name,
    string memory _symbol,
    ISuperfluid host,
    IConstantFlowAgreementV1 cfa,
    address _ERC20MintRestrict,
    int96 _affiliatePortion
  )
    public ERC721 ( _name, _symbol )
    RedirectAll (
      host,
      cfa,
      _owner
     )
  { 
    ERC20MintRestrict = _ERC20MintRestrict;
    _ap.affiliatePortion = _affiliatePortion;
    owner = _owner;
  }

  modifier hasEnoughERC20Restrict() {
    require(IERC20(ERC20MintRestrict).balanceOf(msg.sender) >= ERC20MintRestrictBalanceRequirement, "!bal"); // You do not own enough of the designated ERC20 token to mint an affiliate NFT
    _;
  }

  modifier isOwner() {
    require(msg.sender == _ap.owner,"!own"); // Shouldn't be minting affiliate NFTs to contract deployer
    _;
  }

  // @dev Potential affiliate will call this function if they want an NFT for themself
  // @notice on dApp, when minting, tokenURI will be a randomly generated aquatic mammal word concatenation 
  function mint(string memory tokenURI) public hasEnoughERC20Restrict returns (uint256 tokenId) {
    require(msg.sender != _ap.owner, "!own");               // Shouldn't be minting affiliate NFTs to contract deployer
    require(_ap.referralcodeToToken[tokenURI] == 0, "!uri");   // prevent minter from minting an NFT with the same affiliate code (tokenURI) as before to prevent affiliate flows from being stolen
    require(keccak256( bytes(tokenURI) ) != keccak256( bytes("") )); // We don't want to be minting an affiliate NFT with now referral code

    tokenIds.increment();
    tokenId = tokenIds.current();

    _mint(msg.sender,tokenId);
    _setTokenURI(tokenId,tokenURI); 

    // Set msg.sender as affiliate for the token
    _ap.tokenToAffiliate[tokenId] = msg.sender; 

    // Set referral code to corresponding token
    _ap.referralcodeToToken[tokenURI] = tokenId;

    // Emit event that NFT was minted
    emit NewAffiliateLink(tokenId, msg.sender);

  }
  

  function _beforeTokenTransfer(
    address from,
    address to,
    uint256 tokenId
  ) internal override {
    if (from != address(0)) {
      _changeReceiver(from, to, tokenId);
    }
  }

  function _burn(uint256 tokenId) internal override(ERC721, ERC721URIStorage) {
      super._burn(tokenId);
  }

  function tokenURI(uint256 tokenId)
      public
      view
      override(ERC721, ERC721URIStorage)
      returns (string memory)
  {
      return super.tokenURI(tokenId);
  }

  // @dev In the event of a bug, cancellation, etc., the setLock can be used to lock the app and block incoming flows and allow current flows to be cancelled or unlock if things are okay
  function setLock(bool lockStatus) public isOwner {
    _ap.locked = lockStatus;
  }

  // @notice You can just set ERC20RestrictBalanceRequirement to zero if you don't want there to be a token restriction
  function setERC20MintRestriction(
    uint256 newERC20MintRestrictBalanceRequirement,
    address newERC20MintRestrict
  ) external isOwner {
    ERC20MintRestrict = newERC20MintRestrict;
    ERC20MintRestrictBalanceRequirement = newERC20MintRestrictBalanceRequirement;
  }

  // Set another acceptable super tokens for subscription payments beyond the acceptedTokenStarter started off with
  function setNewAcceptedToken(
    ISuperToken supertoken
  ) external isOwner {
    // Makeshift solution - if the address provided is not a super token, this will error out
    address underlying = supertoken.getUnderlyingToken();

    _ap.acceptedTokensList.push(supertoken);
    _ap.acceptedTokens[supertoken] = true;
  }

  function getAffiliateTokenIdForSubscriber(
    address subscriber
  ) external view returns (uint256 tokenId) {
    return _ap.subscribers[subscriber].tokenId;
  }

  function getAffiliateForSubscriber(
    address subscriber
  ) external view returns (address) {
    return _ap.tokenToAffiliate[_ap.subscribers[subscriber].tokenId];
  }

  function getERC20MintRestrictBalanceRequirement() external view returns (uint256) {
    return ERC20MintRestrictBalanceRequirement;
  }

  function getERC20MintRestrict() external view returns (address) {
    return ERC20MintRestrict;
  }

  function getAffiliateFromTokenId(uint256 tokenId) external view returns (address) {
    return _ap.tokenToAffiliate[tokenId];
  }

  function getSusbcriberPaymentToken(address subscriber) external view returns (address) {
    return address(_ap.subscribers[subscriber].paymentToken);
  }

  function getAcceptedTokensList() external view returns (ISuperToken[] memory) {
    return _ap.acceptedTokensList;
  }

}