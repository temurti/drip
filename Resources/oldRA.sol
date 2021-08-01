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
        ISuperToken acceptedToken,
        address owner) {
        require(address(host) != address(0), "host");
        require(address(cfa) != address(0), "cfa");
        require(address(acceptedToken) != address(0), "acceptedToken");
        require(address(owner) != address(0), "owner");
        require(!host.isApp(ISuperApp(owner)), "owner SA"); // owner cannot be a super app

        _ap.host = host;
        _ap.cfa = cfa;
        _ap.acceptedToken = acceptedToken;
        _ap.owner = owner;

        uint256 configWord =
            SuperAppDefinitions.APP_LEVEL_FINAL |
            SuperAppDefinitions.BEFORE_AGREEMENT_CREATED_NOOP |
            SuperAppDefinitions.BEFORE_AGREEMENT_UPDATED_NOOP |
            SuperAppDefinitions.BEFORE_AGREEMENT_TERMINATED_NOOP;

        _ap.host.registerApp(configWord);
    }

    // @dev If a new stream is opened
    function _createOutflow(bytes calldata ctx) private returns (bytes memory newCtx) {
        newCtx = ctx;

        // Get user data from context (affiliate code)
        string memory affCode = abi.decode(_ap.host.decodeCtx(ctx).userData, (string));

        // Get new flowRate from subscriber (ctx.msgSender) to this (subscriber inflow)
        address subscriber = _ap.host.decodeCtx(ctx).msgSender;
        (,int96 newFlowFromSubscriber,,) = _ap.cfa.getFlow(_ap.acceptedToken, subscriber, address(this));
        console.log("Incoming from Subscriber");
        console.logInt(newFlowFromSubscriber);
        
        // Get current flowRate from this to owner (revenue) from lastFlowRateToOwner in storage (not necessary, just get current, this is something updated in callback, doesn't occur before this function is called. Current will suffice)
        (,int96 currentFlowToOwner,,) = _ap.cfa.getFlow(_ap.acceptedToken, address(this), _ap.owner);

        // if there is user data:
        if ( keccak256( bytes(affCode) ) != keccak256( bytes("") ) ) {

            // Get tokenId associated with the affiliate code
            uint256 tokenId = _ap.referralcodeToToken[affCode];
            // Get [affiliate] address associated with tokenId
            address affiliate = _ap.tokenToAffiliate[tokenId];
            // Get old flowRate to [affiliate] in affiliate => outflow mapping
            int96 currentFlowToAffiliate = _ap.affiliateToOutflow[affiliate];

            // if the affiliate address is not empty
            if (affiliate != address(0)) {

                // increase the old flowRate to affiliate by new flowRate amount in proportion to _ap.affiliatePortion
                int96 newFlowToAffiliate = currentFlowToAffiliate + ( newFlowFromSubscriber * _ap.affiliatePortion ) / 10000;

                // increase the current flowRate from this to owner (program owner's wallet) by new flowRate amount in proportion to (1 - _ap.affiliatePortion) (revenue)
                int96 newFlowToOwner = currentFlowToOwner + ( newFlowFromSubscriber * (10000 - _ap.affiliatePortion) ) / 10000;
                
                // update a mapping of affiliate => outflow | this way you can keep track of affiliate outflow for future changes. This may be unneccessary with getFlow
                _ap.affiliateToOutflow[affiliate] = currentFlowToAffiliate;

                // update a mapping of subscriber => SubscriberProfile.tokenId 
                _ap.subscribers[subscriber].tokenId = tokenId;

                // start necessary flows
                if (currentFlowToOwner == 0) {
                    console.log("Allocation to owner | Create");
                    console.logInt(newFlowToOwner);
                    newCtx = _createFlow(_ap.owner,newFlowToOwner,newCtx);
                    console.log("Allocation to owner | Create | Stream Successful");
                } else {
                    console.log("Allocation to owner | Update");
                    newCtx = _updateFlow(_ap.owner,newFlowToOwner,newCtx);
                    console.logInt(newFlowToOwner);
                    console.log("Allocation to owner | Update | Stream Successful");
                }

                if (currentFlowToAffiliate == 0) {
                    console.log("Allocation to affiliate | Create");
                    console.logInt(newFlowToAffiliate);
                    newCtx = _createFlow(affiliate,newFlowToAffiliate,newCtx);
                    console.log("Allocation to affiliate | Create | Stream Successful");
                } else {
                    console.log("Allocation to affiliate | Update");
                    console.logInt(newFlowToAffiliate);
                    newCtx = _updateFlow(affiliate,newFlowToAffiliate,newCtx);
                    console.log("Allocation to affiliate | Update | Stream Successful");
                }

                // TODO: update variables at the end here. Like how you didn't update _ap.affiliateToOutflow[affiliate] and it breaks when a new flow is openned under same affiliate
                _ap.affiliateToOutflow[affiliate] = newFlowToAffiliate;

            } 
            // else (somehow they are using an invalid affiliate code)
            else {

                // start equivalent outflow to owner (program owner's wallet)
                int96 newFlowToOwner = currentFlowToOwner + newFlowFromSubscriber;

                if (currentFlowToOwner == 0) {
                    console.log("Erratic Affiliate Code | Create | Equivalent outflow to owner");
                    newCtx = _createFlow(_ap.owner,newFlowToOwner,newCtx);
                } else {
                    console.log("Erratic Affiliate Code | Update | Equivalent outflow to owner");
                    newCtx = _updateFlow(_ap.owner,newFlowToOwner,newCtx);
                }

            }
                
        }
        // (else) if there is not user data:
        else {
            // start equivalent outflow to owner (program owner's wallet)
            int96 newFlowToOwner = currentFlowToOwner + newFlowFromSubscriber;

            if (currentFlowToOwner == 0) {
                console.log("Create | Equivalent outflow to owner");
                newCtx = _createFlow(_ap.owner,newFlowToOwner,newCtx);
            } else {
                console.log("Update | Equivalent outflow to owner");
                newCtx = _updateFlow(_ap.owner,newFlowToOwner,newCtx);
            }

        }

        // update a mapping of subscriber => SubscriberProfile.inflowRate
        _ap.subscribers[subscriber].inflowRate = newFlowFromSubscriber;
        // update lastFlowRateToOwner in storage (not neccessary)
        // _ap.lastFlowRateToOwner = newFlowToOwner;

    }

    // @dev If an existing stream is updated
    function _updateOutflow(bytes calldata ctx) private returns (bytes memory newCtx) {
        newCtx = ctx;

        // Get associated tokenId in subscriber => subscribers.tokenId mapping
        address subscriber = _ap.host.decodeCtx(ctx).msgSender;
        uint256 tokenId = _ap.subscribers[subscriber].tokenId;

        // Get [affiliate] address associated with tokenId
        address affiliate = _ap.tokenToAffiliate[tokenId];
        
        // Get old flowRate from subscriber in subscriber => SubscriberProfile.inflowRate mapping
        int96 oldFlowFromSubscriber = _ap.subscribers[subscriber].inflowRate;

        // Get new flowRate from subscriber (ctx.msgSender) to this (subscriber inflow)
        (,int96 newFlowFromSubscriber,,) = _ap.cfa.getFlow(_ap.acceptedToken, subscriber, address(this));
        console.log("Incoming from Subscriber");
        console.logInt(newFlowFromSubscriber);

        // Get old flowRate to [affiliate] in affiliate => outflow mapping
        int96 currentFlowToAffiliate = _ap.affiliateToOutflow[affiliate];

        // Get current flowRate from this to owner (revenue) from lastFlowRateToOwner in storage
        (,int96 currentFlowToOwner,,) = _ap.cfa.getFlow(_ap.acceptedToken, address(this), _ap.owner);

        // if the affiliate address is not empty
        if (affiliate != address(0)) {

            // Get the [difference] between new flowRate from subscriber and old flowRate from subscriber
            int96 changeInFlowSubscriber = newFlowFromSubscriber - oldFlowFromSubscriber;

            // Calculate new flows to affiliate and owner as proportions of [difference] dictated by _ap.affiliatePortion
            int96 newFlowToAffiliate   = currentFlowToOwner     + ( changeInFlowSubscriber * (10000 - _ap.affiliatePortion) ) / 10000;
            int96 newFlowToOwner       = currentFlowToAffiliate + ( changeInFlowSubscriber *  _ap.affiliatePortion          ) / 10000;
        
            // increase/decrease the old flowRate to affiliate by [difference] amount in proportion to _ap.affiliatePortion
            console.log("Update | Adjusted portion affiliate flow");
            console.logInt( newFlowToAffiliate );
            newCtx = _updateFlow(affiliate, newFlowToAffiliate, newCtx);
            console.log("Update | Adjusted portion affiliate flow | Stream Successful");

            // increase/decrease the current flowRate from this to owner (program owner's wallet) by [difference] amount in proportion to (1 - _ap.affiliatePortion) (revenue)
            console.log("Update | Adjusted portion owner flow");
            console.logInt( newFlowToOwner );
            newCtx = _updateFlow(_ap.owner, newFlowToOwner, newCtx);
            console.log("Update | Adjusted portion owner flow | Stream Successful");

            // update a mapping of affiliate => outflow | this way you can keep track of affiliate outflow for future changes. This may be unneccessary with getFlow
            _ap.affiliateToOutflow[affiliate] = newFlowToAffiliate;   
        }
        // (else) if the affiliate address is empty
        else {

            // Get the [difference] between new flowRate of subscriber and old flowRate of subscriber
            int96 changeInFlowSubscriber = newFlowFromSubscriber - oldFlowFromSubscriber;

            // Calculate new flow to owner as currentFlowToOwner + changeInFlowSubscriber
            int96 newFlowToOwner = currentFlowToOwner + changeInFlowSubscriber;

            // increase/decrease the outflow to owner (program owner's wallet) by [difference] amount. (revenue)
            console.log("Update | Adjusted portion owner flow");
            console.logInt( newFlowToOwner );
            newCtx = _updateFlow(_ap.owner, newFlowToOwner, newCtx);
            console.log("Update | Adjusted portion owner flow | Stream Successful");
        }

        // update a mapping of subscriber => SubscriberProfile.inflowRate
        _ap.subscribers[subscriber].inflowRate = newFlowFromSubscriber;
        // update lastFlowRateToOwner in storage
        // _ap.lastFlowRateToOwner = newFlowToOwner;

    }

    // @dev If an existing stream is terminated
    function _terminateOutflow(bytes calldata ctx) private returns (bytes memory newCtx) {
        // Get associated tokenId in subscriber => SubscriberProfile.tokenId mapping
        // Get [affiliate] address associated with tokenId

        // Get [old flowRate from subscriber] in subscriber => SubscriberProfile.inflowRate mapping

        // Get old flowRate to [affiliate] in affiliate => outflow mapping
        // Get current flowRate from this to owner (revenue) from lastFlowRateToOwner in storage

        // if the affiliate address is not empty

            // increase/decrease the old flowRate to affiliate by [old flowRate from subscriber] in proportion to _ap.affiliatePortion
            // increase/decrease the current flowRate from this to owner (program owner's wallet) by [old flowRate from subscriber] amount in proportion to (1 - _ap.affiliatePortion) (revenue)

            // update a mapping of affiliate => outflow | this way you can keep track of affiliate outflow for future changes. This may be unneccessary with getFlow
        
        // (else) if the affiliate address is empty

            // increase/decrease the outflow to owner (program owner's wallet) by [old flowRate from subscriber] amount. (revenue)

        // delete subscriber from subscribers mapping
        // update lastFlowRateToOwner in storage

    }


    // @dev Change the Receiver of the total flow
    function _changeReceiver( address from, address newReceiver, uint tokenId ) internal {
        // require new receiver not be another super app or zero address

        // update affiliate address in tokenToAffiliate mapping (tokenId => affiliate address) to new affiliate

        // add new affiliate to affiliateToOutflow and set its outflow rate equal to the old affiliates

        // delete old affiliate from affiliateToOutflow (affiliate address => outFlowRate)

        // if there's already an outflow for the tokenId:
            
            // delete stream to old affiliate

            // start equivalent stream to new affiliate

    }

    /**************************************************************************
     * SuperApp callbacks
     *************************************************************************/

    // This will run whenever an agreement is created, even that from this contract outwards. That's an issue
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
        console.log("Flow Received!");
        return _createOutflow(_ctx);
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
        return _updateOutflow(_ctx);
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
        if (!_isSameToken(_superToken) || !_isCFAv1(_agreementClass)) return _ctx;
        return _updateOutflow(_ctx);
    }

    function _isSameToken(ISuperToken superToken) private view returns (bool) {
        return address(superToken) == address(_ap.acceptedToken);
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
        require(_isSameToken(superToken), "RedirectAll: not accepted token");
        require(_isCFAv1(agreementClass), "RedirectAll: only CFAv1 supported");
        _;
    }

    function _createFlow(
        address to,
        int96 flowRate,
        bytes memory ctx
    ) internal returns (bytes memory newCtx) {
        (newCtx, ) = _ap.host.callAgreementWithContext(
            _ap.cfa,
            abi.encodeWithSelector(
                _ap.cfa.createFlow.selector,
                _ap.acceptedToken,
                to,
                flowRate,
                new bytes(0) // placeholder
            ),
            "0x",
            ctx
        );
    }

    function _updateFlow(
        address to,
        int96 flowRate,
        bytes memory ctx
    ) internal returns (bytes memory newCtx) {
        (newCtx, ) = _ap.host.callAgreementWithContext(
            _ap.cfa,
            abi.encodeWithSelector(
                _ap.cfa.updateFlow.selector,
                _ap.acceptedToken,
                to,
                flowRate,
                new bytes(0) // placeholder
            ),
            "0x",
            ctx
        );
    }

    function _deleteFlow(
        address from,
        address to,
        bytes memory ctx
    ) internal returns (bytes memory newCtx) {
        (newCtx, ) = _ap.host.callAgreementWithContext(
            _ap.cfa,
            abi.encodeWithSelector(
                _ap.cfa.deleteFlow.selector,
                _ap.acceptedToken,
                from,
                to,
                new bytes(0) // placeholder
            ),
            "0x",
            ctx
        );
    }

}