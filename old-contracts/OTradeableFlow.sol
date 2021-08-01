//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
pragma abicoder v2;

import "hardhat/console.sol";

import {RedirectAll, ISuperToken, IConstantFlowAgreementV1, ISuperfluid} from "./RedirectAll.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import {TradeableFlowStorage} from "./TradeableFlowStorage.sol";


contract TradeableFlow is ERC721, ERC721URIStorage, RedirectAll {

  using Counters for Counters.Counter;
  Counters.Counter tokenIds;
  using TradeableFlowStorage for TradeableFlowStorage.Link;

  event NewAffiliateLink(uint tokenId, address owner);      // Emitted when a new affiliate link is created

  address public owner;
  address public ERC20Restrict;                       // ERC20 token for which you must have enough balance to mint TradeableFlow NFT
  uint256 public ERC20RestrictBalanceRequirement;     // Balance of ERC20 token required by wallet to mint TradeableFlow NFT
  bool public tokenRestriction;                       // Whether or not minting TradeableFlow NFT is to be restricted based on user's balance of 

  constructor (
    address _owner,
    string memory _name,
    string memory _symbol,
    ISuperfluid host,
    IConstantFlowAgreementV1 cfa,
    ISuperToken acceptedToken,
    address _ERC20Restrict,
    bool _tokenRestriction
  )
    public ERC721 ( _name, _symbol )
    RedirectAll (
      host,
      cfa,
      acceptedToken,
      _owner
     )
  { 
    ERC20Restrict = _ERC20Restrict;
    tokenRestriction = _tokenRestriction;
    owner = _owner;
  }

  modifier hasEnoughERC20Restrict() {
    uint256 bal = IERC20(ERC20Restrict).balanceOf(msg.sender);
    if (tokenRestriction) {
      require(bal >= ERC20RestrictBalanceRequirement, "!ERC20RestrictBalanceRequirement"); // You do not own enough of the designated ERC20 token to mint an affiliate NFT
    }
    _;
  }

  modifier isOwner() {
    require(msg.sender == owner,"!owner");
    _;
  }

  // @dev Potential affiliate will call this function if they want an NFT for themself
  // @notice on dApp, when minting, tokenURI will be a randomly generated aquatic mammal word concatenation 
  function mint(string memory tokenURI) public hasEnoughERC20Restrict returns (uint256 tokenId) {
    // TODO: add in functionality that limits the amount of NFTs an affiliate can have to one
    require(msg.sender != _ap.owner, "!owner"); // Shouldn't be minting affiliate NFTs to contract deployer
    require(balanceOf(msg.sender) == 0); // You can only mint an affiliate NFT is you don't own any

    tokenIds.increment();
    tokenId = tokenIds.current();

    _mint(msg.sender,tokenId);
    _setTokenURI(tokenId,tokenURI); 

    _ap.links[tokenId] = TradeableFlowStorage.Link(0,msg.sender); // inflow rate is initially zero when NFT is first minted

  }

  // @notice The tokenID is to be used as the affiliate code
  // @param tokenId
  function getAfflilateLink(uint tokenId) external returns (TradeableFlowStorage.Link memory link) {
    return _ap.links[tokenId];
  }


  // @dev Register a referral, associating the address of the subscriber with a tokenId
  // @param refered The address of the referred subscriber
  // @param tokenId The token to associate this referral tool
  function registerReferral(address referred, uint tokenId) external {
    require(_ap.referrals[referred] == 0, "ref");
    _ap.referrals[referred] = tokenId;
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

  function setERC20RestrictDeets(
    address newERC20Restrict,
    uint256 newERC20RestrictBalanceRequirement,
    bool newtokenRestriction
  ) public isOwner {
    ERC20Restrict = newERC20Restrict;
    ERC20RestrictBalanceRequirement = newERC20RestrictBalanceRequirement;
    tokenRestriction = newtokenRestriction;
  }

  // function getERC20RestrictBalanceRequirement() external view returns (uint256) {
  //   return ERC20RestrictBalanceRequirement;
  // }

  // function getTokenRestriction() external view returns (bool) {
  //   return tokenRestriction;
  // }

}