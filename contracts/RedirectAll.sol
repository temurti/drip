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
} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";

import {
    IConstantFlowAgreementV1
} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/agreements/IConstantFlowAgreementV1.sol";

import {
    SuperAppBase
} from "@superfluid-finance/ethereum-contracts/contracts/apps/SuperAppBase.sol";

import "./TradeableFlowStorage.sol";

/// @author Drip Finance
/// @title Flow Redirection
contract RedirectAll is SuperAppBase {

    using TradeableFlowStorage for TradeableFlowStorage.AffiliateProgram;
    TradeableFlowStorage.AffiliateProgram internal _ap;
    TradeableFlowStorage.TempContextData internal _tcd;

    event flowCreated(address indexed subscriber, int96 flowRate, uint256 tokenId); 
    event flowUpdated(address indexed subscriber, int96 flowRate, uint256 tokenId);

    constructor(
        ISuperfluid host,
        IConstantFlowAgreementV1 cfa,
        address owner,
        string memory registrationKey
        ) {
        require(address(host) != address(0), "host");
        require(address(cfa) != address(0), "cfa");
        require(address(owner) != address(0), "owner");
        require(!host.isApp(ISuperApp(owner)), "owner SA");

        _ap.host = host;
        _ap.cfa = cfa;
        _ap.owner = owner;

        uint256 configWord =
            SuperAppDefinitions.APP_LEVEL_FINAL |
            SuperAppDefinitions.BEFORE_AGREEMENT_CREATED_NOOP |
            SuperAppDefinitions.BEFORE_AGREEMENT_UPDATED_NOOP |
            SuperAppDefinitions.BEFORE_AGREEMENT_TERMINATED_NOOP;

        // _ap.host.registerApp(configWord);
        if(bytes(registrationKey).length > 0) {
            _ap.host.registerAppWithKey(configWord, registrationKey);
        } else {
            _ap.host.registerApp(configWord);
        }
    }

    /**************************************************************************
     * Tradeable Flow Logic
    *************************************************************************/

    /**
    @notice Redirecting flows to owner/affiliate when new subscription flows are opened to the app
    @dev Should keep app netflow zero. Responds to affiliate code in context user data
    @param supertoken Supertoken that the flow is being created with
    @return newCtx The new app context after outbound flows are adjusted
    */
    function _createOutflow(ISuperToken supertoken) internal returns (bytes memory newCtx) {
        newCtx = _tcd.ctx;
        
        // Get subscriber from agreementData
        (address subscriber, ) = abi.decode(_tcd.agreementData, (address, address));

        // Require that a subscriber isn't starting a flow with a different super token than what they currently use (if they already have one)
        if (_ap.subscribers[subscriber].paymentToken != ISuperToken(address(0))) {
            require(_ap.subscribers[subscriber].paymentToken == supertoken,"!token");
        }

        // Require that an owner can't start a flow to their own app
        require(subscriber != _ap.owner,"!own");
        
        // Get new flowRate from subscriber to this (subscriber inflow)
        (,int96 newFlowFromSubscriber,,) = _ap.cfa.getFlow(supertoken, subscriber, address(this));
        
        // Get current flowRate from this to owner (revenue) from lastFlowRateToOwner in storage (not necessary, just get current, this is something updated in callback, doesn't occur before this function is called. Current will suffice)
        (,int96 currentFlowToOwner,,) = _ap.cfa.getFlow(supertoken, address(this), _ap.owner);

        // Get user data from context (affiliate code) - because of this, the createFlow must be done with userData specified or it will revert
        string memory affCode = abi.decode(_ap.host.decodeCtx(newCtx).userData, (string));

        // Set up newFlowToOwner variable, value will be captured in if/else (if affiliated, change by 1-affiliate portion, if not affiliate, change by whole amount of newFlowFromSubscriber)
        // We are initially setting it up equal to currentFlow + newFlow as if there was no affiliate. 
        // If there is affiliation, the if-else below will override it to currentFlow + newFlowFromSubscriber, less the affiliate portion
        int96 newFlowToOwner = currentFlowToOwner + newFlowFromSubscriber;

        // Get tokenId associated with the affiliate code (only relevant if there is user data)
        uint256 tokenId = _ap.referralcodeToToken[affCode];

        // If there is user data:
        if ( keccak256( bytes(affCode) ) != keccak256( bytes("") ) ) {
            // Get [affiliate] address associated with tokenId
            address affiliate = _ap.tokenToAffiliate[tokenId];
            // If the affiliate address is not empty (so it's a valid referral code)
            if (affiliate != address(0)) {
                // Get old flowRate to [affiliate] in affiliate => outflow mapping
                (,int96 currentFlowToAffiliate,,) = _ap.cfa.getFlow(supertoken, address(this), affiliate);
                // Calculate potion of newFlowFromSubscriber that will go towards increasing affiliate's income in proportion to _ap.affiliatePortion
                int96 affiliateChangeAmount = ( newFlowFromSubscriber * _ap.affiliatePortion) / 1000000000000;
                // Increase flow to affiliate
                int96 newFlowToAffiliate = currentFlowToAffiliate + affiliateChangeAmount;
                // Take remainder of affiliateChangeAmount and add to owner revenue
                newFlowToOwner = currentFlowToOwner + (newFlowFromSubscriber - affiliateChangeAmount);
                // Update a mapping of subscriber => SubscriberProfile.tokenId 
                _ap.subscribers[subscriber].tokenId = tokenId;
                // Start/update flow to affiliate
                if (currentFlowToAffiliate == 0) {
                    newCtx = _createFlow(affiliate,newFlowToAffiliate,supertoken,newCtx);
                } else {
                    newCtx = _updateFlow(affiliate,newFlowToAffiliate,supertoken,newCtx);
                }
                // Update outflow associated with that NFT token id
                _ap.tokenToPaymentTokentoOutflowRate[tokenId][supertoken] += affiliateChangeAmount;
            }
        }

        // With newFlowToOwner to owner calculated amongst above if-elses, create/update flow to owner
        if (currentFlowToOwner == 0) {
            newCtx = _createFlow(_ap.owner,newFlowToOwner,supertoken,newCtx);
        } else {
            newCtx = _updateFlow(_ap.owner,newFlowToOwner,supertoken,newCtx);
        }

        // Update a mapping of subscriber => SubscriberProfile.inflowRate
        _ap.subscribers[subscriber].inflowRate = newFlowFromSubscriber;

        // Update the subscribers super token for payment
        _ap.subscribers[subscriber].paymentToken = supertoken;

        // Update the tokenToSubscribers mapping/array for reading
        _ap.tokenToSubscribersArray[tokenId].push(subscriber);
        _ap.tokenToSubscribersMapping[tokenId][subscriber] = true;

        emit flowCreated(subscriber , newFlowFromSubscriber, _ap.referralcodeToToken[affCode]);

    }

    /**
    @notice Redirecting flows to owner/affiliate when a subscription flow to the app is adjusted
    @dev Should keep app netflow zero. Prevents beneficiaries from cancelling outbound streams
    @param supertoken Supertoken that the flow is being adjusted with
    @return newCtx The new app context after outbound flows are adjusted
    */
    function _updateOutflow(ISuperToken supertoken) internal returns (bytes memory newCtx) {
        newCtx = _tcd.ctx;

        // Get subscriber from agreementData
        (address subscriber, address app) = abi.decode(_tcd.agreementData, (address, address));

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

        // if the affiliate address is not empty and it's not the affiliate/owner being an idiot and cancelling his/her income stream
        if (affiliate != address(0) && changeInFlowSubscriber != 0) {
            // Get current flow to affiliate
            (,int96 currentFlowToAffiliate,,) = _ap.cfa.getFlow(supertoken, address(this), affiliate);
            // Calculate potion of newFlowFromSubscriber that will go towards increasing affiliate's income in proportion to _ap.affiliatePortion
            int96 affiliateChangeAmount = ( changeInFlowSubscriber * _ap.affiliatePortion) / 1000000000000;
            // Change flow to affiliate
            int96 newFlowToAffiliate = currentFlowToAffiliate + affiliateChangeAmount;
            // Take remainder of affiliateChangeAmount and add to owner revenue
            newFlowToOwner = currentFlowToOwner + ( changeInFlowSubscriber - affiliateChangeAmount );
            // increase/decrease the old flowRate to affiliate
            if (newFlowToAffiliate == 0) {
                newCtx = _deleteFlow(address(this) , affiliate , supertoken , newCtx);
            } else {
                newCtx = _updateFlow(affiliate , newFlowToAffiliate , supertoken , newCtx);
            } 
            // Update outflow associated with that NFT token id
            _ap.tokenToPaymentTokentoOutflowRate[_ap.subscribers[subscriber].tokenId][supertoken] += affiliateChangeAmount;
        }

        // Guard against rogue beneficiaries: affiliates + owner
        // If the changeInFlowSubscriber is zero, it must mean that the subscriber flow hasn't changed and it's the affiliate/owner trying to cancel his/her income stream
        else if (changeInFlowSubscriber == 0) {
            // get the net flow for the application. This will get the outward flow that was lost from the affiliate/owner cancelling
            int96 netFlow = _ap.cfa.getNetFlow(supertoken,address(this));

            // Control for updating to same amount and having a intended error, not just this convenient self flow reversion
            require(netFlow != 0,"updatedToSameFlow");

            // recreating the flow back to the affiliate/owner. So basically, we're just restarting the flow they deleted because we're not allowed to prevent them from deleting
            // "app" here is really the rogue affiliate/owner
            newCtx = _createFlow(app,netFlow,supertoken,newCtx);

        }

        // increase/decrease the current flowRate from this to owner (program owner's wallet) by changeInFlowSubscriber amount
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
            delete _ap.tokenToSubscribersMapping[_ap.subscribers[subscriber].tokenId][subscriber];
            delete _ap.subscribers[subscriber];
        }

        emit flowUpdated(subscriber, newFlowFromSubscriber, _ap.subscribers[subscriber].tokenId);

    }

    /**
    @notice Adjusts outbound affiliate flows when an affiliate NFT is transferred
    @dev Need to iterate over all accepted tokens because affiliates due to permission of multiple payment tokens
    @param oldAffiliate Affiliate who is sending affiliate NFT. Flows cancelled.
    @param newAffiliate Affiliate who is receiving affiliate NFT. Flows created
    @param tokenId Token ID of affiliate NFT being transferred
    */
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
                // new stream to affiliate should be old stream less stream pertinent to token being transferred
                int96 newFlowToAffiliate = oldAffiliateOutflow - _ap.tokenToPaymentTokentoOutflowRate[tokenId][_ap.acceptedTokensList[i]];
                // update streams
                if (newFlowToAffiliate == 0) {
                    // If the new affiliate flow is zero (so maybe they owned only one DripNFT), delete their flow
                    _deleteFlow(address(this), oldAffiliate, _ap.acceptedTokensList[i]); // what case are we deleting a zero flow???
                } else {
                    // Maybe the affiliate has another NFT they're earning income on. Only update down to newFlowToAffiliate.
                    _updateFlow(oldAffiliate, newFlowToAffiliate, _ap.acceptedTokensList[i]);
                }
                // update affiliate address in tokenToAffiliate mapping (tokenId => affiliate address) to new affiliate
                _ap.tokenToAffiliate[tokenId] = newAffiliate;
                // Get currentFlowToAffiliate (the new affiliate may already be an affiliate earning affiliate income)
                (,int96 currentFlowToNewAffiliate,,) = _ap.cfa.getFlow(_ap.acceptedTokensList[i], address(this), newAffiliate);
                // If there is flow pertaining to this accepted token (_ap.tokenToPaymentTokentoOutflowRate[tokenId][_ap.acceptedTokensList[i]] isn't zero) then proceed to recreate flows to new affiliate
                if (_ap.tokenToPaymentTokentoOutflowRate[tokenId][_ap.acceptedTokensList[i]] != 0) {
                    // if the new affiliate doesn't have a flow, createFlow in amount pertinent to token being transferred to the new affiliate
                    if (currentFlowToNewAffiliate == 0) {
                        _createFlow(newAffiliate, _ap.tokenToPaymentTokentoOutflowRate[tokenId][_ap.acceptedTokensList[i]], _ap.acceptedTokensList[i]);
                    }
                    // else, (new affiliate already has a flow), update to increase it
                    else {
                        _updateFlow(newAffiliate, currentFlowToNewAffiliate + _ap.tokenToPaymentTokentoOutflowRate[tokenId][_ap.acceptedTokensList[i]], _ap.acceptedTokensList[i]);
                    }
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

    /**
     * @dev Super App callback responding the creation of a CFA to the app
     * 
     * Response logic in _createOutflow
     *
     * Requirements:
     *
     * - owner cannot be starting stream.
     * - app cannot be locked
     * - only expected agreement (CFA) and accepted super token
     * - current superfluid host
     */
    function afterAgreementCreated(
        ISuperToken _superToken,
        address _agreementClass,
        bytes32, // _agreementId,
        bytes calldata _agreementData,
        bytes calldata ,// _cbdata,
        bytes calldata _ctx
    )
        external override
        onlyExpected(_superToken, _agreementClass)
        onlyHost
        returns (bytes memory newCtx)
    {
        require(msg.sender != _ap.owner, "!own");
        require(!_ap.locked,"locked");

        _tcd.agreementData = _agreementData;
        _tcd.ctx = _ctx;

        return _createOutflow(_superToken);
    }

    /**
     * @dev Super App callback responding to the update of a CFA to the app
     * 
     * Response logic in _updateOutflow
     *
     * Requirements:
     *
     * - app cannot be locked
     * - only expected agreement (CFA) and accepted super token
     * - current superfluid host
     */
    function afterAgreementUpdated(
        ISuperToken _superToken,
        address _agreementClass,
        bytes32 ,//_agreementId,
        bytes calldata _agreementData,
        bytes calldata ,//_cbdata,
        bytes calldata _ctx
    )
        external override
        onlyExpected(_superToken, _agreementClass)
        onlyHost
        returns (bytes memory newCtx)
    {
        require(!_ap.locked,"locked");

        _tcd.agreementData = _agreementData;
        _tcd.ctx = _ctx;
        
        return _updateOutflow(_superToken);
        
    }

    /**
     * @dev Super App callback responding the ending of a CFA to the app
     * 
     * Response logic in _updateOutflow
     * Allowing termination when app is locked for emergency control
     *
     * Requirements:
     *
     * - only expected agreement (CFA) and accepted super token
     * - current superfluid host
     */
    function afterAgreementTerminated(
        ISuperToken _superToken,
        address _agreementClass,
        bytes32 ,//_agreementId,
        bytes calldata _agreementData,
        bytes calldata ,//_cbdata,
        bytes calldata _ctx
    )
        external override
        onlyHost
        returns (bytes memory newCtx)
    {
        // According to the app basic law, we should never revert in a termination callback
        if (!_isValidToken(_superToken) || !_isCFAv1(_agreementClass)) return _ctx;

        _tcd.agreementData = _agreementData;
        _tcd.ctx = _ctx;

        return _updateOutflow(_superToken);
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

    modifier onlyOwner() {
        require(msg.sender == _ap.owner,"!own"); 
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

    /**************************************************************************
     * SuperApp emergency and admin functionality
     *************************************************************************/

    /**
     * @dev Allows owner to close any stream to app if the app has been locked
     * 
     * In the event of emergency, you can cancel incoming streams and let the app crash into insolvency to cancel outgoing streams to owner/affiliates
     *
     * Requirements:
     *
     * - app is under locked status
     * - only owners can close streams in emergency
     */
    function _emergencyCloseStream(address streamer, ISuperToken supertoken) external onlyOwner { 
        require(_ap.locked, "!locked");
        _ap.host.callAgreement(
            _ap.cfa,
            abi.encodeWithSelector(
                _ap.cfa.deleteFlow.selector,
                supertoken,    
                streamer,      // from
                address(this), // to (app)
                new bytes(0)   // placeholder
            ),
            "0x"
        );
    }

    /**
     * @dev Allows owner to sweep any balance of a super token in the app when the app is locked
     *
     * Requirements:
     *
     * - app is under locked status
     * - only owner can balance sweep
     */
    function balanceSweep(ISuperToken token, uint256 amount) external onlyOwner {
        require(_ap.locked, "!locked");

        token.transfer(_ap.owner, amount);

    }


}