# Uniwhales Superfluid Affiliate Marketing Contracts

# Drip Finance Contracts v1.0

# Overview

Drip leverages Superfluid streams to create a real-time affiliate program. A business can create an affiliate program through which affiliates can sign up by minting a cashflow NFT and begin referring subscribers with their affiliate codes. When a subscriber begins a subscription stream with an affiliate's referral code, they get a portion of that subscription income as specified by the program owner (the business).

Drip's smart contracts possess 3 components:
1. TradeableFlow: ERC721 logic and getters/setters
2. RedirectFlow: Superfluid logic - handling creating/updating/deleting streams, stream logic for NFT transfer, and emergency functionality
3. TradeableFlowStorage: Library containing structs detailing TradeableFlow data

# TradeableFlow

        ISuperfluid host,
        IConstantFlowAgreementV1 cfa,
        address owner,
        string memory registrationKey

### Parameters

```address _owner``` - (passes to inherited RedirectAll) Program owner (the entity profiting from subscriber revenue)

```address _drip``` - Creators of Drip. Provided authority to ensure compensation for providing real-time affiliate program smart contract framework to program owner

```string memory _name``` - (passes to inherited ERC721) NFT Contract Name (e.g. "Uniwhales Drip Cashflow NFT")

```string memory _symbol``` - (passes to inherited ERC721) NFT Token Symbol (e.g. "DRIP-UWL")

```string memory _baseURI``` - Base URI of NFT Metadata

```ISuperfluid host``` - (passes to inherited RedirectAll) Superfluid host contract

```IConstantFlowAgreementV1 cfa``` - (passes to inherited RedirectAll) The stored constant flow agreement class address

```int96 _affiliatePortion``` - Portion of referred subscriber revenue that corresponding affiliates receive ( affiliatePortion / 10000 ) should equal desired portion. If this is greater than 10000, contract will NOT work

```string memory registrationKey``` - (passes to inherited RedirectAll) Registration key provided by Superfluid to allow mainnet deployment (not needed for testnet deployment)


### State Variables

```owner``` - Program owner (the entity profiting from subscriber revenue)

```drip``` - Creators of Drip. Provided authority to ensure compensation for providing real-time affiliate program smart contract framework to program owner

```ERC20MintRestrict``` - ERC20 token for which you must have enough balance to mint TradeableFlow NFT

```ERC20MintRestrictBalanceRequirement```- Balance of ERC20 token required by wallet to mint TradeableFlow NFT - not set in constructor (so initially it's zero) but can be adjusted with setters

```whitelist``` - addresses mapped to their ```AffiliateMintingStatus``` (whether they're whitelisted and how many NFTs they've minted)

```whitelistActive``` - Whether or not whitelist is active

```mintLimit``` - Amount of NFTs a whitelisted address is allowed to mint

```baseURI``` - Base URI pointing to Drip asset database

### Structs

```AffiliateMintingStatus```
- ```whitelisted``` - permission to mint
- ```quantityMinted``` - amount minted so far

### Modifiers

```WhitelistRestriction``` - if whitelist is active, activates select address and quantity restrictions chosen by program owner

```ERC20Restriction``` - Must own enough of the designated ERC20 token to mint an affiliate NFT

```onlyAuthorizedLocker``` - ensures caller is owner or drip as these are the two entities permitted to lock program

### Events

```NewAffiliateLink``` - Emitted when a new affiliate link is created

```NewBaseURISet``` - Emitted when a new baseURI for NFT is set

```AppLocked``` - Emitted when app is locked (see ```lock()``` function for details below)

### Write Methods

```mint(string memory referralCode)```
* Parameters
  * ```referralCode``` - URI appended to baseURI, **serves as referral code**
* Pre-conditions
  * App is not locked
  * Shouldn't be minting affiliate NFTs to contract deployer
  * Minter can't mint an NFT with the same ```referralCode``` (tokenURI) as before to prevent affiliate flows from being stolen
  * ```referralCode``` can't be an empty string
* Post-conditions
  * Referral code set for minted token id
  * Token minted to new affiliate
  * NewAffiliateLink event emitted

```_beforeTokenTransfer(address from, address to, uint256 tokenId)```
* Parameters
  * ```from``` - sender of NFT
  * ```to``` - receiver of NFT
  * ```tokenId``` - token ID of NFT being transferred
* Pre-conditions
  * ```to``` is not the program owner
* Post-conditions
  * Flows to ```from``` address cancelled and opened to new ```to``` address

```lock()```
* Pre-conditions
  * ```onlyAuthorizedLocker```
* Post-conditions
  * ```locked``` in ```TradeableFlowStorage``` is now true - streams cannot be opened or updated to app and owner may close streams or sweep contract balance

```unlock()```
* Pre-conditions
  * ```onlyAuthorizedLocker```
* Post-conditions
  * ```locked``` in ```TradeableFlowStorage``` is now false - streams can now be opened to the app

```setWhiteList(address newMinter, bool status)```
* Parameters
  * ```newMinter``` - new minter whose whitelist status is being modified
  * ```status``` - new status of minter address
* Pre-conditions
  * ```onlyOwner```
* Post-conditions
  * ```newMinter``` whitelist status set to ```status```
  * ```SetWhiteList``` event emitted

```setWhiteListStatus(bool newStatus, uint256 newMintLimit)```
* Parameters
  * ```newStatus``` - new status of whitelist (active or not)
  * ```newMintLimit``` - how much whitelisted addresses are allowed to mint
* Pre-conditions
  * ```onlyOwner```
* Post-conditions
  * ```whitelistActive``` and ```mintLimit``` have been set to ```newStatus``` and ```newMintLimit``` respectively

```setBaseURI(string memory newBaseURI)```
* Parameters
  * ```newBaseURI``` - new base URI for NFT metadata
* Pre-conditions
  * ```onlyOwner```
* Post-conditions
  * ```baseURI``` set to ```newBaseURI```
  * ```NewBaseURISet(newBaseURI)``` emitted

```setERC20MintRestriction(uint256 newERC20MintRestrictBalanceRequirement, address newERC20MintRestrict)```
* Parameters
  * ```newERC20MintRestrictBalanceRequirement``` - balance of ERC20 token needed to mint affiliate NFT
  * ```newERC20MintRestrict``` - ERC20 token required for minting
* Pre-conditions
  * ```onlyOwner```
* Post-conditions
  * ```ERC20MintRestrict``` is set to ```newERC20MintRestrict``` and ```ERC20MintRestrictBalanceRequirement``` to ```newERC20MintRestrictBalanceRequirement```

```setNewAcceptedToken(ISuperToken supertoken)```
* Parameters
  * ```supertoken``` - New super token to be accepted for payment
* Pre-conditions
  * ```onlyOwner```
  * ```supertoken``` must be a super token
  * ```supertoken``` must have not already been set
* Post-conditions
  * In ```TradeableFlowStorage```, ```acceptedTokensList``` gets ```supertoken``` appended to it
  * In ```TradeableFlowStorage```, ```acceptedTokens``` mapping has the ```supertoken``` validity set to true

```setNewDripOwner(address newDrip)```
* Parameters
  * ```newDrip``` - Address of new monetization authority address
* Pre-conditions
  * Caller must be ```drip```
* Post-conditions
  * ```drip``` set to ```newDrip```

### Read Methods - please consult [TradeableFlow](./contracts/TradeableFlow.sol).

# TradeableFlowStorage Library

### Structs

```AffiliateProgram``` - Holds core data to affiliate program
- ```owner``` - Program owner
- ```host``` - Superfluid host contract
- ```cfa``` - The stored constant flow agreement class address
- ```acceptedTokensList``` - List of all accepted super tokens (iterateable so for changeReceiver, we can iterate over and change flows)
- ```acceptedTokens``` - Contains all super tokens permitted as payment for subscription service as a mapping
- ```referralcodeToToken``` - Maps referral code to tokenIds
- ```tokenToReferralCode``` - Maps tokenIds to referral code
- ```tokenToAffiliate``` - Maps NFT token ID to affiliate address
- ```tokenToSubscribers``` - Maps NFT token ID to subscribers who used its referral code for querying
- ```subscribers``` - Maps subscriber to [how much subscriber is streaming into the app] + [the affiliate who referred the subscriber]
- ```tokenToPaymentTokentoOutflowRate``` - Maps NFT token ID to outflow rate for each token to for tracking when transferring
- ```affiliatePortion``` - Portion of referred subscriber revenue that corresponding affiliates receive ( affiliatePortion / 10000 ) should equal desired portion. If this is greater than 10000, contract will NOT work
- ```locked``` - whether or not the program has been locked in the event of cancellation, an emergency, bug, etc.

```TempContextData``` - Storage struct used hold data in avoiding stack too deep error
- ```agreementData``` - data on agreement call to which the callback is reacting. Contains info on address openning stream, userdata, and more
- ```ctx``` - object containing context on actions taken during callback. See below from [Superfluid codebase](https://github.com/superfluid-finance/protocol-monorepo/blob/b28955c5a3001714026fa4a9bc56a7b2627064a7/packages/ethereum-contracts/contracts/superfluid/Superfluid.sol#L856):
```
ctx = abi.encode(
    abi.encode(
        callInfo,
        context.timestamp,
        context.msgSender,
        context.agreementSelector,
        context.userData
    ),
    abi.encode(
        allowanceIO,
        context.appAllowanceUsed,
        context.appAddress,
        context.appAllowanceToken
    )
);
```

```SubscriberProfile``` - Subscriber's Details
- ```paymentToken``` - token subscriber is paying with
- ```tokenId``` - the tokenId representing the affiliate from which the subscriber was referred
- ```inflowRate``` - how much is the subscriber streaming into the app. used for diff tracking in _updateOutflow

# RedirectAll

```_createOutflow```

Callback response to a subscription flow being opened.

- If flow is opened with no affiliate code:
    a. Flow to program owner increased by total new flow amount
- If a flow is opened with incorrect affiliate code:
    a. Flow to program owner increased by total new flow amount
- If a flow is opened with valid affiliate code:
    a. Flow to affiliate increased by ```affiliatePortion``` of new flow amount
    b. Flow to owner increased by new flow amount less flow to affiliate

```_updateOutflow```

Callback response to a subscription flow being updated OR deleted.

- If adjusting subscriber has no affiliate
    a. Flow to program owner adjusted by difference between new rate and old rate
- If adjusting subscriber has subscribed with an affiliate code
    a. Flow to affiliate adjusted to ```affiliatePortion``` of new flow amount
    b. Flow to owner adjusted by new rate less flow to affiliate

```_changeReceiver```

Flow change response to an NFT being transferred
* Parameters
  * ```oldAffiliate``` - from address
  * ```newAffiliate``` - to address
  * ```tokenId``` - token ID of NFT being transferred
* Pre-conditions
  * newAffiliate can't be zero address
  * new Affiliate can't be another SuperApp
* Post-conditions
  * flows in all tokens to ```oldAffiliate``` recreated to ```newAffiliate```
    * accounts for possibility of having multiple cashflow NFTs

### SuperApp Callbacks

```afterAgreementCreated```
```afterAgreementUpdated```
```afterAgreementTerminated```

### Flow Modification Helper Functions

```_createFlow```
```_updateFlow```
```_deleteFlow```

### Emergency Functions

```_emergencyCloseStream```

Allows owner to close any stream to app if the app has been locked
* Parameters
  * ```streamer``` - address of streamer whose stream is being cancelled
  * ```supertoken``` - supertoken streamer is using to pay
* Pre-conditions
  * only owner can do stream closures
  * ```_ap.locked``` is true
* Post-conditions
  * flows from ```streamer``` to app is cancelled

```balanceSweep```

Allows owner to sweep any balance of a super token in the app when the app is locked
* Parameters
  * ```token``` - super token whose balance is to be transferred out of app
  * ```amount``` - amount of the token to be withdrawn
* Pre-conditions
  * only owner can do balance sweeps
  * ```_ap.locked``` is true
* Post-conditions
  * ```amount``` of ```token``` has been withdrawn from app to owner