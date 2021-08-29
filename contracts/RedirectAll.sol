// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
pragma abicoder v2;

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

    event ReceiverChanged(address receiver, uint tokenId);    // TODO: Emitted when the token is transfered and receiver is changed

    constructor(
        ISuperfluid host,
        IConstantFlowAgreementV1 cfa,
        // ISuperToken acceptedTokensStarter,
        address owner) {
        require(address(host) != address(0), "host");
        require(address(cfa) != address(0), "cfa");
        // require(address(acceptedToken) != address(0), "acceptedToken");
        require(address(owner) != address(0), "owner");
        require(!host.isApp(ISuperApp(owner)), "owner SA"); // owner cannot be a super app

        _ap.host = host;
        _ap.cfa = cfa;
        // _ap.acceptedTokensList.push(acceptedTokensStarter);
        // _ap.acceptedTokens[acceptedTokensStarter] = true;
        _ap.owner = owner;

        uint256 configWord =
            SuperAppDefinitions.APP_LEVEL_FINAL |
            SuperAppDefinitions.BEFORE_AGREEMENT_CREATED_NOOP |
            SuperAppDefinitions.BEFORE_AGREEMENT_UPDATED_NOOP |
            SuperAppDefinitions.BEFORE_AGREEMENT_TERMINATED_NOOP;

        _ap.host.registerApp(configWord);
    }

    // @dev If a new stream is opened
    function _createOutflow(bytes calldata ctx, ISuperToken supertoken) internal returns (bytes memory newCtx) {
        newCtx = ctx;

        // Get new flowRate from subscriber (ctx.msgSender) to this (subscriber inflow)
        address subscriber = _ap.host.decodeCtx(ctx).msgSender;

        // require that a subscriber isn't starting a flow with a different super token than what they currently use (if they already have one)
        if (_ap.subscribers[subscriber].paymentToken != ISuperToken(address(0))) {
            require(_ap.subscribers[subscriber].paymentToken == supertoken,"!token");
        }
        
        // Get new flowRate from subscriber to this (subscriber inflow)
        (,int96 newFlowFromSubscriber,,) = _ap.cfa.getFlow(supertoken, subscriber, address(this));
        
        // Get current flowRate from this to owner (revenue) from lastFlowRateToOwner in storage (not necessary, just get current, this is something updated in callback, doesn't occur before this function is called. Current will suffice)
        (,int96 currentFlowToOwner,,) = _ap.cfa.getFlow(supertoken, address(this), _ap.owner);

                // Get user data from context (affiliate code) - because of this, the createFlow must be done with userData specified or it will revert
        string memory affCode = abi.decode(_ap.host.decodeCtx(ctx).userData, (string));

        // Set up newFlowToOwner variable, value will be captured in if/else (if affiliated, change by 1-affiliate portion, if not affiliate, change by whole amount of newFlowFromSubscriber)
        // We are initially setting it up equal to currentFlow + newFlow as if there was no affiliate. 
        // If there is affiliation, the if-else below will override it to currentFlow + newFlowFromSubscriber, less the affiliate portion
        int96 newFlowToOwner = currentFlowToOwner + newFlowFromSubscriber;

        // if there is user data:
        if ( keccak256( bytes(affCode) ) != keccak256( bytes("") ) ) {

            // Get tokenId associated with the affiliate code
            uint256 tokenId = _ap.referralcodeToToken[affCode];
            // Get [affiliate] address associated with tokenId
            address affiliate = _ap.tokenToAffiliate[tokenId];
            // Get old flowRate to [affiliate] in affiliate => outflow mapping
            (,int96 currentFlowToAffiliate,,) = _ap.cfa.getFlow(supertoken, address(this), affiliate);

            // if the affiliate address is not empty (so it's a valid referral code)
            if (affiliate != address(0)) {

                // increase the old flowRate to affiliate by new flowRate amount in proportion to _ap.affiliatePortion
                int96 newFlowToAffiliate = currentFlowToAffiliate + ( newFlowFromSubscriber * _ap.affiliatePortion) / 1000000000000;

                // capture the increased flowRate from this to owner (program owner's wallet) by new flowRate amount in proportion to (1 - _ap.affiliatePortion) (revenue).
                newFlowToOwner = currentFlowToOwner + ( newFlowFromSubscriber * (1000000000000 - _ap.affiliatePortion) ) / 1000000000000;

                // update a mapping of subscriber => SubscriberProfile.tokenId 
                _ap.subscribers[subscriber].tokenId = tokenId;

                // Start/update flow to affiliate
                if (currentFlowToAffiliate == 0) {

                    newCtx = _createFlow(affiliate,newFlowToAffiliate,supertoken,newCtx);
                } else {
                    newCtx = _updateFlow(affiliate,newFlowToAffiliate,supertoken,newCtx);
                }

            } 
                
        }
        // With newFlowToOwner to owner calculated amongst above if-elses, create/update flow to owner
        if (currentFlowToOwner == 0) {
            newCtx = _createFlow(_ap.owner,newFlowToOwner,supertoken,newCtx);
        } else {
            newCtx = _updateFlow(_ap.owner,newFlowToOwner,supertoken,newCtx);
        }

        // update a mapping of subscriber => SubscriberProfile.inflowRate
        _ap.subscribers[subscriber].inflowRate = newFlowFromSubscriber;
        // update the subscribers super token for payment
        _ap.subscribers[subscriber].paymentToken = supertoken;

    }

    // @dev If an existing stream is updated
    function _updateOutflow(bytes calldata ctx, ISuperToken supertoken) internal returns (bytes memory newCtx) {
        newCtx = ctx;

        // Get subscriber from msgSender
        address subscriber = _ap.host.decodeCtx(ctx).msgSender;

        // Get associated tokenId in subscriber => subscribers.tokenId mapping amd then get [affiliate] address associated with tokenId
        address affiliate = _ap.tokenToAffiliate[ _ap.subscribers[subscriber].tokenId ];
        
        // Get new flowRate from subscriber (ctx.msgSender) to this (subscriber inflow)
        (,int96 newFlowFromSubscriber,,) = _ap.cfa.getFlow(supertoken, subscriber, address(this));

        // Get current flowRate from this to owner (revenue) from lastFlowRateToOwner in storage
        (,int96 currentFlowToOwner,,) = _ap.cfa.getFlow(supertoken, address(this), _ap.owner);

        // Get the [difference] between new flowRate from subscriber and old flowRate from subscriber (Get old flowRate from subscriber in subscriber => SubscriberProfile.inflowRate mapping)
        int96 changeInFlowSubscriber = newFlowFromSubscriber - _ap.subscribers[subscriber].inflowRate;

        // Set up newFlowToOwner variable, value will be captured in if/else (if affiliated, change by 1-affiliate portion, if not affiliate, change by whole amount)
        int96 newFlowToOwner = currentFlowToOwner + changeInFlowSubscriber;

        // if the affiliate address is not empty
        if (affiliate != address(0) && changeInFlowSubscriber != 0) {
            // Get current flow to affiliate
            (,int96 currentFlowToAffiliate,,) = _ap.cfa.getFlow(supertoken, address(this), affiliate);

            // Calculate new flows to affiliate and owner as proportions of [difference] dictated by _ap.affiliatePortion added to current flow rate
            newFlowToOwner = currentFlowToOwner + ( changeInFlowSubscriber * (1000000000000 - _ap.affiliatePortion) ) / 1000000000000;
            int96 newFlowToAffiliate = currentFlowToAffiliate + ( changeInFlowSubscriber *  _ap.affiliatePortion) / 1000000000000;

            // increase/decrease the old flowRate to affiliate by [difference] amount in proportion to _ap.affiliatePortion - delete if zero
            if (newFlowToAffiliate == 0) {
                newCtx = _deleteFlow(address(this) , affiliate , supertoken , newCtx);
            } else {
                newCtx = _updateFlow(affiliate , newFlowToAffiliate , supertoken , newCtx);
            } 

        }
        // Guard against rogue beneficiaries: affiliates + owner
        // If the changeInFlowSubscriber is zero, it must mean that the subscriber flow hasn't changed and it's the affiliate/owner being an idiot and cancelling his/her income stream
        else if (changeInFlowSubscriber == 0) {

            // get the net flow for the application. This will get the outward flow that was lost from the affiliate/owner cancelling
            int96 netFlow = _ap.cfa.getNetFlow(supertoken,address(this));

            // recreating the flow back to the affiliate/owner. So basically, we're just restarting the flow they deleted because we're not allowed to prevent them from deleting
            // "subscriber" here is really the rogue affiliate/owner
            newCtx = _createFlow(subscriber,netFlow,supertoken,newCtx);

        }

        // increase/decrease the current flowRate from this to owner (program owner's wallet) by changeInFlowSubscriber amount in proportion to (1 - _ap.affiliatePortion) (revenue)
        // if the new newFlowToOwner is zero but it's because the owner has deleted their flow, we don't want to cancel to protect the restarting of the stream to the owner in the elif section above
        if (changeInFlowSubscriber != 0) {
            if (newFlowToOwner == 0) {
                newCtx = _deleteFlow(address(this) , _ap.owner , supertoken , newCtx);
            } else {
                newCtx = _updateFlow(_ap.owner , newFlowToOwner , supertoken , newCtx);
            }
        }

        // update a mapping of subscriber => SubscriberProfile.inflowRate
        _ap.subscribers[subscriber].inflowRate = newFlowFromSubscriber;
        // if the subscriber is deleting his/her flow, delete their profile
        if (newFlowFromSubscriber == 0) {
            delete _ap.subscribers[subscriber];
        }
        // if (newFlowFromSubscriber == 0) {
        //     // remove the supertoken from their profile in storage
        //     _ap.subscribers[subscriber].paymentToken = ISuperToken(address(0));
        //     // delete affiliate token
        // }

    }

    // @dev Change the Receiver of the total flow
    function _changeReceiver( address oldAffiliate, address newAffiliate, uint tokenId ) internal {
        // require new receiver not be another super app or zero address
        require(newAffiliate != address(0), "0addr");
        require(!_ap.host.isApp(ISuperApp(newAffiliate)), "SA");

        // for each approved token, go through and redirect flows
        for (uint i=0; i<_ap.acceptedTokensList.length; i++) {

            // Get old flow to affiliate (so just the current flow as it's about to be changed)
            (,int96 oldAffiliateOutflow,,) = _ap.cfa.getFlow(_ap.acceptedTokensList[i], address(this), oldAffiliate);

            // if there's already an outflow for the tokenId:
            if (oldAffiliateOutflow != 0) {
                // delete stream to old affiliate
                _deleteFlow(address(this), oldAffiliate, _ap.acceptedTokensList[i]);

                // update affiliate address in tokenToAffiliate mapping (tokenId => affiliate address) to new affiliate
                _ap.tokenToAffiliate[tokenId] = newAffiliate;

                // Get currentFlowToAffiliate (the new affiliate may already be an affiliate earning affiliate income)
                (,int96 currentFlowToNewAffiliate,,) = _ap.cfa.getFlow(_ap.acceptedTokensList[i], address(this), newAffiliate);

                // if the new affiliate doesn't have a flow, createFlow equivalent to flow to previous affiliate to the new affiliate
                if (currentFlowToNewAffiliate == 0) {
                    _createFlow(newAffiliate, oldAffiliateOutflow, _ap.acceptedTokensList[i]);
                }
                // else, (new affiliate already has a flow), update to increase it
                else {
                    _updateFlow(newAffiliate, currentFlowToNewAffiliate + oldAffiliateOutflow, _ap.acceptedTokensList[i]);
                }

            } 
            // need to update affiliate program details even if it's a cashflow-less affiliate NFT
            else {

                // update affiliate address in tokenToAffiliate mapping (tokenId => affiliate address) to new affiliate
                _ap.tokenToAffiliate[tokenId] = newAffiliate;

            }

        }

    }


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
        return _createOutflow(_ctx, _superToken);
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
        return _updateOutflow(_ctx, _superToken);
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
        if (!_isValidToken(_superToken) || !_isCFAv1(_agreementClass)) return _ctx;
        return _updateOutflow(_ctx, _superToken);
    }

    function _isValidToken(ISuperToken superToken) private view returns (bool) {
        return _ap.acceptedTokens[superToken] == true;
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
        require(_isValidToken(superToken), "RedirectAll: not accepted token");
        require(_isCFAv1(agreementClass), "RedirectAll: only CFAv1 supported");
        _;
    }

    function _createFlow(
        address to,
        int96 flowRate,
        ISuperToken _superToken,
        bytes memory ctx
    ) internal returns (bytes memory newCtx) {
        (newCtx, ) = _ap.host.callAgreementWithContext(
            _ap.cfa,
            abi.encodeWithSelector(
                _ap.cfa.createFlow.selector,
                _superToken,
                to,
                flowRate,
                new bytes(0) // placeholder
            ),
            "0x",
            ctx
        );
    }

    function _createFlow(address to, int96 flowRate, ISuperToken _superToken) internal {
       _ap.host.callAgreement(
           _ap.cfa,
           abi.encodeWithSelector(
               _ap.cfa.createFlow.selector,
               _superToken,
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
        ISuperToken _superToken,
        bytes memory ctx
    ) internal returns (bytes memory newCtx) {
        (newCtx, ) = _ap.host.callAgreementWithContext(
            _ap.cfa,
            abi.encodeWithSelector(
                _ap.cfa.updateFlow.selector,
                _superToken,
                to,
                flowRate,
                new bytes(0) // placeholder
            ),
            "0x",
            ctx
        );
    }

    function _updateFlow(address to, int96 flowRate, ISuperToken _superToken) internal {
        _ap.host.callAgreement(
            _ap.cfa,
            abi.encodeWithSelector(
                _ap.cfa.updateFlow.selector,
                _superToken,
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
        ISuperToken _superToken,
        bytes memory ctx
    ) internal returns (bytes memory newCtx) {
        (newCtx, ) = _ap.host.callAgreementWithContext(
            _ap.cfa,
            abi.encodeWithSelector(
                _ap.cfa.deleteFlow.selector,
                _superToken,
                from,
                to,
                new bytes(0) // placeholder
            ),
            "0x",
            ctx
        );
    }

    function _deleteFlow(address from, address to, ISuperToken _superToken) internal {
        _ap.host.callAgreement(
            _ap.cfa,
            abi.encodeWithSelector(
                _ap.cfa.deleteFlow.selector,
                _superToken,
                from,
                to,
                new bytes(0) // placeholder
            ),
            "0x"
        );
    }

}