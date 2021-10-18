pragma solidity ^0.8.0;

import {
    ISuperfluid,
    ISuperToken
} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";

import {
    IConstantFlowAgreementV1
} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/agreements/IConstantFlowAgreementV1.sol";



library TradeableFlowStorage  {


   // Subscriber's details
  struct SubscriberProfile {
    ISuperToken paymentToken;                            // token subscriber is paying with
    uint256 tokenId;                                     // the tokenId representing the affiliate from which the subscriber was referred
    int96 inflowRate;                                    // how much is the subscriber streaming into the app. used for diff tracking in _updateOutflow
  }

  // An affiliate program generated when TradeableFlow is deployed
  struct AffiliateProgram {                              
    address owner;                                                                      // Program owner
    ISuperfluid host;                                                                   // Superfluid host contract
    IConstantFlowAgreementV1 cfa;                                                       // The stored constant flow agreement class address
    ISuperToken[] acceptedTokensList;                                                   // List of all accepted super tokens (iterateable so for changeReceiver, we can iterate over and change flows)
    mapping(ISuperToken => bool) acceptedTokens;                                        // Contains all super tokens permitted as payment for subscription service as a mapping
    mapping(string => uint256) referralcodeToToken;                                     // Maps referral code to tokenIds
    mapping(uint256 => string) tokenToReferralCode;                                     // Maps tokenIds to referral code
    mapping(uint256 => address) tokenToAffiliate;                                       // Maps NFT token ID to affiliate address
    mapping(address => SubscriberProfile) subscribers;                                  // Maps subscriber to [how much subscriber is streaming into the app] + [the affiliate who referred the subscriber]
    mapping(uint256 => mapping(ISuperToken => int96)) tokenToPaymentTokentoOutflowRate; // Maps NFT token ID to outflow rate for each token to for tracking when transferring
    int96 affiliatePortion;                                                             // Portion of referred subscriber revenue that corresponding affiliates receive ( affiliatePortion / 10000 ) should equal desired portion. If this is greater than 10000, contract will NOT work
    bool locked;                                                                        // whether or not the program has been locked in the event of an emergency, bug, etc.
  }

  // Storage struct used to avoid stack too deep error
  struct TempContextData {
    bytes agreementData;
    bytes ctx;
  }

}