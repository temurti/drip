// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
pragma abicoder v2;

import "hardhat/console.sol";

import {
    ISuperfluid,
    ISuperToken,
    ISuperApp,
    ISuperAgreement,
    SuperAppDefinitions
} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";//"@superfluid-finance/ethereum-monorepo/packages/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";

import {
    IConstantFlowAgreementV1
} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/agreements/IConstantFlowAgreementV1.sol";

import {
    SuperAppBase
} from "@superfluid-finance/ethereum-contracts/contracts/apps/SuperAppBase.sol";

import "./TradeableFlowStorage.sol";

contract RedirectAll is SuperAppBase {

    using TradeableFlowStorage for TradeableFlowStorage.AffiliateProgram;
    TradeableFlowStorage.AffiliateProgram internal _ap;

    event ReceiverChanged(address receiver, uint tokenId);    // Emitted when the token is transfered and receiver is changed

    constructor(
        ISuperfluid host,
        IConstantFlowAgreementV1 cfa,
        ISuperToken[] memory acceptedTokens,
        address owner) {
        require(address(host) != address(0), "host");
        require(address(cfa) != address(0), "cfa");
        // require(address(acceptedToken) != address(0), "acceptedToken");
        require(address(owner) != address(0), "owner");
        require(!host.isApp(ISuperApp(owner)), "owner SA"); // owner cannot be a super app

        _ap.host = host;
        _ap.cfa = cfa;
        _ap.acceptedTokens = acceptedTokens;
        _ap.owner = owner;

        uint256 configWord =
            SuperAppDefinitions.APP_LEVEL_FINAL |
            SuperAppDefinitions.BEFORE_AGREEMENT_CREATED_NOOP |
            SuperAppDefinitions.BEFORE_AGREEMENT_UPDATED_NOOP |
            SuperAppDefinitions.BEFORE_AGREEMENT_TERMINATED_NOOP;

        _ap.host.registerApp(configWord);
    }

    // @dev If a new stream is opened
    function _createOutflow(bytes calldata ctx, ISuperToken _superToken) internal returns (bytes memory newCtx) {
        newCtx = ctx;

        // Get user data from context (affiliate code) - because of this, the createFlow must be done with userData specified or it will revert
        string memory affCode = abi.decode(_ap.host.decodeCtx(ctx).userData, (string));

        // Get new flowRate from subscriber (ctx.msgSender) to this (subscriber inflow) for the _superToken
        address subscriber = _ap.host.decodeCtx(ctx).msgSender;
        (,int96 newFlowFromSubscriber,,) = _ap.cfa.getFlow(_superToken, subscriber, address(this));
        
        // Get current flowRate from this to owner (revenue) for the _superToken
        (,int96 currentFlowToOwner,,) = _ap.cfa.getFlow(_superToken, address(this), _ap.owner);

        // Set up newFlowToOwner variable, value will be captured in if/else (if affiliated, change by 1-affiliate portion, if not affiliate, change by whole amount)
        int96 newFlowToOwner;

        // if there is user data:
        if ( keccak256( bytes(affCode) ) != keccak256( bytes("") ) ) {

            // Get tokenId associated with the affiliate code
            uint256 tokenId = _ap.referralcodeToToken[affCode];
            // Get [affiliate] address associated with tokenId
            address affiliate = _ap.tokenToAffiliate[tokenId];
            // Get old flowRate to [affiliate] in affiliate => outflow mapping
            int96 currentFlowToAffiliate = _ap.superTokentoAffiliateToOutflow[_superToken][affiliate];

            // if the affiliate address is not empty
            if (affiliate != address(0)) {

                // increase the old flowRate to affiliate by new flowRate amount in proportion to _ap.affiliatePortion
                int96 newFlowToAffiliate = currentFlowToAffiliate + ( newFlowFromSubscriber * _ap.affiliatePortion) / 10000;

                // capture the increased flowRate from this to owner (program owner's wallet) by new flowRate amount in proportion to (1 - _ap.affiliatePortion) (revenue).
                newFlowToOwner = currentFlowToOwner + ( newFlowFromSubscriber * (10000 - _ap.affiliatePortion) ) / 10000;
                
                // update a mapping of affiliate => outflow | this way you can keep track of affiliate outflow for future changes. This may be unneccessary with getFlow
                _ap.affiliateToOutflow[affiliate] = currentFlowToAffiliate;

                // update a mapping of subscriber => SubscriberProfile.tokenId 
                _ap.subscribers[subscriber].tokenId = tokenId;

                // Start/update flow to affiliate
                if (currentFlowToAffiliate == 0) {

                    newCtx = _createFlow(affiliate,newFlowToAffiliate,_superToken,newCtx);
                } else {
                    newCtx = _updateFlow(affiliate,newFlowToAffiliate,_superToken,newCtx);
                }

                _ap.affiliateToOutflow[affiliate] = newFlowToAffiliate;

            } 
            // else (somehow they are using an invalid affiliate code)
            else {

                // start equivalent outflow to owner (program owner's wallet)
                newFlowToOwner = currentFlowToOwner + newFlowFromSubscriber;

            }

            // With newFlowToOwner to owner calculated based on presence of affiliate or not, create/update flow to owner
            if (currentFlowToOwner == 0) {
                // console.log("Erratic Affiliate Code | Create | Equivalent outflow to owner");
                newCtx = _createFlow(_ap.owner,newFlowToOwner,_superToken,newCtx);
            } else {
                // console.log("Erratic Affiliate Code | Update | Equivalent outflow to owner");
                newCtx = _updateFlow(_ap.owner,newFlowToOwner,_superToken,newCtx);
            }
                
        }

        // update a mapping of subscriber => SubscriberProfile.inflowRate
        _ap.subscribers[subscriber].inflowRate = newFlowFromSubscriber;
        // update lastFlowRateToOwner in storage (not neccessary)
        // _ap.lastFlowRateToOwner = newFlowToOwner;

    }


    // @dev If an existing stream is updated
    function _updateOutflow(bytes calldata ctx, ISuperToken _superToken) internal returns (bytes memory newCtx) {
        newCtx = ctx;

        // Get subscriber from msgSender
        address subscriber = _ap.host.decodeCtx(ctx).msgSender;

        // Get associated tokenId in subscriber => subscribers.tokenId mapping amd then get [affiliate] address associated with tokenId
        address affiliate = _ap.tokenToAffiliate[ _ap.subscribers[subscriber].tokenId ];
        
        // Get new flowRate from subscriber (ctx.msgSender) to this (subscriber inflow)
        (,int96 newFlowFromSubscriber,,) = _ap.cfa.getFlow(_ap._superToken, subscriber, address(this));

        // Get current flowRate from this to owner (revenue) from lastFlowRateToOwner in storage
        (,int96 currentFlowToOwner,,) = _ap.cfa.getFlow(_ap._superToken, address(this), _ap.owner);

        // Get the [difference] between new flowRate from subscriber and old flowRate from subscriber (Get old flowRate from subscriber in subscriber => SubscriberProfile.inflowRate mapping)
        int96 changeInFlowSubscriber = newFlowFromSubscriber - _ap.subscribers[subscriber].inflowRate;

        // Set up newFlowToOwner variable, value will be captured in if/else (if affiliated, change by 1-affiliate portion, if not affiliate, change by whole amount)
        int96 newFlowToOwner;        

        // if the affiliate address is not empty
        if (affiliate != address(0)) {

            // Calculate new flows to affiliate and owner as proportions of [difference] dictated by _ap.affiliatePortion added to current flow rate
            newFlowToOwner = currentFlowToOwner + ( changeInFlowSubscriber * (10000 - _ap.affiliatePortion) ) / 10000;
            int96 newFlowToAffiliate = _ap.affiliateToOutflow[affiliate] + ( changeInFlowSubscriber *  _ap.affiliatePortion) / 10000;

            // increase/decrease the old flowRate to affiliate by [difference] amount in proportion to _ap.affiliatePortion - delete if zero
            if (newFlowToAffiliate == 0) {
                newCtx = _deleteFlow(address(this) , affiliate , _superToken , newCtx);
            } else {
                newCtx = _updateFlow(affiliate , newFlowToAffiliate , _superToken , newCtx);
            }

            // update a mapping of affiliate => outflow | this way you can keep track of affiliate outflow for future changes. This may be unneccessary with getFlow
            _ap.affiliateToOutflow[affiliate] = newFlowToAffiliate; 

        }
        // (else) if the affiliate address is empty
        else {

            // Calculate new flow to owner as currentFlowToOwner + changeInFlowSubscriber
            newFlowToOwner = currentFlowToOwner + changeInFlowSubscriber;

        }

        // increase/decrease the current flowRate from this to owner (program owner's wallet) by [difference] amount in proportion to (1 - _ap.affiliatePortion) (revenue)
        if (newFlowToOwner == 0) {
            newCtx = _deleteFlow(address(this) , _ap.owner , _superToken , newCtx);
        } else {
            newCtx = _updateFlow(_ap.owner , newFlowToOwner , _superToken , newCtx);
        }
    
        // update a mapping of subscriber => SubscriberProfile.inflowRate
        _ap.subscribers[subscriber].inflowRate = newFlowFromSubscriber;
        // update lastFlowRateToOwner in storage
        // _ap.lastFlowRateToOwner = newFlowToOwner;

    }

    // @dev Change the Receiver of the total flow
    function _changeReceiver( address oldAffiliate, address newAffiliate, uint tokenId ) internal {
        // require new receiver not be another super app or zero address (hell, actually if you wanna send your cashflow NFT into oblivion, be our guest. Saves contract space for us)
        // require(newAffiliate != address(0), "0addr");
        require(!_ap.host.isApp(ISuperApp(newAffiliate)), "SA");
        // require that the newAffiliate doesn't already have an outflow
        // require(_ap.affiliateToOutflow[newAffiliate] == 0, "AlreadyAff");

        // if there's already an outflow for the tokenId:
        if (_ap.affiliateToOutflow[oldAffiliate] != 0) {
            // delete stream to old affiliate
            _deleteFlow(address(this), oldAffiliate);

            // update affiliate address in tokenToAffiliate mapping (tokenId => affiliate address) to new affiliate
            _ap.tokenToAffiliate[tokenId] = newAffiliate;

            // Get currentFlowToAffiliate
            int96 currentFlowToNewAffiliate = _ap.affiliateToOutflow[newAffiliate];

            // if the new affiliate doesn't have a flow, createFlow
            if (currentFlowToNewAffiliate == 0) {
                _createFlow(newAffiliate, _ap.affiliateToOutflow[oldAffiliate]);
                // Add to the affiliateToOutflow the new affiliate and set it to the entire flow of the old affiliate (because the affiliate doesn't have a current flow)
                _ap.affiliateToOutflow[newAffiliate] = _ap.affiliateToOutflow[oldAffiliate];  
            }
            // else, (new affiliate already has a flow), update to increase it
            else {
                _updateFlow(newAffiliate, currentFlowToNewAffiliate + _ap.affiliateToOutflow[oldAffiliate]);
                // Add to the affiliateToOutflow the new affiliate and set it to the entire flow of the old affiliate plus the current flow the the new affiliate
                _ap.affiliateToOutflow[newAffiliate] = currentFlowToNewAffiliate + _ap.affiliateToOutflow[oldAffiliate];
            }
            
            // // add new affiliate to affiliateToOutflow and set its outflow rate equal to the old affiliates
            // _ap.affiliateToOutflow[newAffiliate] = _ap.affiliateToOutflow[oldAffiliate];

            // delete old affiliate from affiliateToOutflow (affiliate address => outFlowRate)
            delete _ap.affiliateToOutflow[oldAffiliate];

        } 
        // need to update affiliate program details even if it's a cashflow-less affiliate NFT
        else {

            // update affiliate address in tokenToAffiliate mapping (tokenId => affiliate address) to new affiliate
            _ap.tokenToAffiliate[tokenId] = newAffiliate;

            // @dev are any of the below statements unncessary

            // add new affiliate to affiliateToOutflow and set its outflow rate equal to the old affiliates
            _ap.affiliateToOutflow[newAffiliate] = _ap.affiliateToOutflow[oldAffiliate];

            // delete old affiliate from affiliateToOutflow (affiliate address => outFlowRate)
            delete _ap.affiliateToOutflow[oldAffiliate];

        }

    }

    // TODO: add function that returns the affiliate associated with an address. This way affiliate program can call it and if it's empty, not offer discount

    /**************************************************************************
     * SuperApp callbacks
     *************************************************************************/

    function afterAgreementCreated(
        ISuperToken _superToken,
        address _agreementClass,
        bytes32, // _agreementId,
        bytes calldata /*_agreementData*/,
        bytes calldata ,// _cbdata,
        bytes calldata _ctx
    )
        external override
        onlyExpected(_superToken, _agreementClass)
        onlyHost
        returns (bytes memory newCtx)
    {
        // return _updateOutflow(_ctx);
        return _createOutflow(_ctx,_superToken);
    }

    function afterAgreementUpdated(
        ISuperToken _superToken,
        address _agreementClass,
        bytes32 ,//_agreementId,
        bytes calldata /*_agreementData*/,
        bytes calldata ,//_cbdata,
        bytes calldata _ctx
    )
        external override
        onlyExpected(_superToken, _agreementClass)
        onlyHost
        returns (bytes memory newCtx)
    {
        return _updateOutflow(_ctx,_superToken);
    }

    function afterAgreementTerminated(
        ISuperToken _superToken,
        address _agreementClass,
        bytes32 ,//_agreementId,
        bytes calldata /*_agreementData*/,
        bytes calldata ,//_cbdata,
        bytes calldata _ctx
    )
        external override
        onlyHost
        returns (bytes memory newCtx)
    {
        // According to the app basic law, we should never revert in a termination callback
        if (!_isAcceptedToken(_superToken) || !_isCFAv1(_agreementClass)) return _ctx;
        return _updateOutflow(_ctx);
    }

    function _isAcceptedToken(ISuperToken superToken) private view returns (bool) {
        
        return _ap.acceptedTokens[address(superToken)] == true;
        // return address(superToken) == address(_ap.acceptedToken);
    }

    function _isCFAv1(address agreementClass) private view returns (bool) {
        return ISuperAgreement(agreementClass).agreementType()
            == keccak256("org.superfluid-finance.agreements.ConstantFlowAgreement.v1");
    }

    modifier onlyHost() {
        require(msg.sender == address(_ap.host), "RedirectAll: support only one host");
        _;
    }

    modifier onlyExpected(ISuperToken superToken, address agreementClass) {
        require(_isAcceptedToken(superToken), "RedirectAll: not accepted token");
        require(_isCFAv1(agreementClass), "RedirectAll: only CFAv1 supported");
        _;
    }

    function _createFlow(
        address to,
        int96 flowRate,
        ISuperToken superToken,
        bytes memory ctx
    ) internal returns (bytes memory newCtx) {
        (newCtx, ) = _ap.host.callAgreementWithContext(
            _ap.cfa,
            abi.encodeWithSelector(
                _ap.cfa.createFlow.selector,
                superToken,
                to,
                flowRate,
                new bytes(0) // placeholder
            ),
            "0x",
            ctx
        );
    }

    function _createFlow(address to, int96 flowRate, ISuperToken superToken) internal {
       _ap.host.callAgreement(
           _ap.cfa,
           abi.encodeWithSelector(
               _ap.cfa.createFlow.selector,
               superToken,
               to,
               flowRate,
               new bytes(0) // placeholder
           ),
           "0x"
       );
    }

    function _updateFlow(
        address to,
        int96 flowRate,
        ISuperToken superToken,
        bytes memory ctx
    ) internal returns (bytes memory newCtx) {
        (newCtx, ) = _ap.host.callAgreementWithContext(
            _ap.cfa,
            abi.encodeWithSelector(
                _ap.cfa.updateFlow.selector,
                superToken,
                to,
                flowRate,
                new bytes(0) // placeholder
            ),
            "0x",
            ctx
        );
    }

    function _updateFlow(address to, int96 flowRate, ISuperToken superToken) internal {
        _ap.host.callAgreement(
            _ap.cfa,
            abi.encodeWithSelector(
                _ap.cfa.updateFlow.selector,
                superToken,
                to,
                flowRate,
                new bytes(0) // placeholder
            ),
            "0x"
        );
    }

    function _deleteFlow(
        address from,
        address to,
        ISuperToken superToken,
        bytes memory ctx
    ) internal returns (bytes memory newCtx) {
        (newCtx, ) = _ap.host.callAgreementWithContext(
            _ap.cfa,
            abi.encodeWithSelector(
                _ap.cfa.deleteFlow.selector,
                superToken,
                from,
                to,
                new bytes(0) // placeholder
            ),
            "0x",
            ctx
        );
    }

    function _deleteFlow(address from, address to, ISuperToken superToken) internal {
        _ap.host.callAgreement(
            _ap.cfa,
            abi.encodeWithSelector(
                _ap.cfa.deleteFlow.selector,
                superToken,
                from,
                to,
                new bytes(0) // placeholder
            ),
            "0x"
        );
    }

}