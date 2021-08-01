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


import "./TradeableFlowStorage.sol";

library RedirectAllHelper {

    // @dev If a new stream is opened
    function _createOutflow(TradeableFlowStorage.AffiliateProgram storage self , bytes calldata ctx) internal returns (bytes memory newCtx) {
        newCtx = ctx;

        // Get user data from context (affiliate code) - because of this, the createFlow must be done with userData specified or it will revert
        string memory affCode = abi.decode(self.host.decodeCtx(ctx).userData, (string));

        // Get new flowRate from subscriber (ctx.msgSender) to this (subscriber inflow)
        address subscriber = self.host.decodeCtx(ctx).msgSender;
        (,int96 newFlowFromSubscriber,,) = self.cfa.getFlow(self.acceptedToken, subscriber, address(this));
        // console.log("Incoming from Subscriber");
        // console.logInt(newFlowFromSubscriber);
        
        // Get current flowRate from this to owner (revenue) from lastFlowRateToOwner in storage (not necessary, just get current, this is something updated in callback, doesn't occur before this function is called. Current will suffice)
        (,int96 currentFlowToOwner,,) = self.cfa.getFlow(self.acceptedToken, address(this), self.owner);

        // if there is user data:
        if ( keccak256( bytes(affCode) ) != keccak256( bytes("") ) ) {

            // Get tokenId associated with the affiliate code
            uint256 tokenId = self.referralcodeToToken[affCode];
            // Get [affiliate] address associated with tokenId
            address affiliate = self.tokenToAffiliate[tokenId];
            // Get old flowRate to [affiliate] in affiliate => outflow mapping
            int96 currentFlowToAffiliate = self.affiliateToOutflow[affiliate];

            // if the affiliate address is not empty
            if (affiliate != address(0)) {

                // increase the old flowRate to affiliate by new flowRate amount in proportion to self.affiliatePortion
                int96 newFlowToAffiliate = currentFlowToAffiliate + ( newFlowFromSubscriber * self.affiliatePortion ) / 10000;

                // increase the current flowRate from this to owner (program owner's wallet) by new flowRate amount in proportion to (1 - self.affiliatePortion) (revenue)
                int96 newFlowToOwner = currentFlowToOwner + ( newFlowFromSubscriber * (10000 - self.affiliatePortion) ) / 10000;
                
                // update a mapping of affiliate => outflow | this way you can keep track of affiliate outflow for future changes. This may be unneccessary with getFlow
                self.affiliateToOutflow[affiliate] = currentFlowToAffiliate;

                // update a mapping of subscriber => SubscriberProfile.tokenId 
                self.subscribers[subscriber].tokenId = tokenId;

                // start necessary flows
                if (currentFlowToOwner == 0) {
                    // console.log("Allocation to owner | Create");
                    // console.logInt(newFlowToOwner);
                    newCtx = _createFlow(self,self.owner,newFlowToOwner,newCtx);
                    // console.log("Allocation to owner | Create | Stream Successful");
                } else {
                    // console.log("Allocation to owner | Update");
                    newCtx = _updateFlow(self,self.owner,newFlowToOwner,newCtx);
                    // console.logInt(newFlowToOwner);
                    // console.log("Allocation to owner | Update | Stream Successful");
                }

                if (currentFlowToAffiliate == 0) {
                    // console.log("Allocation to affiliate | Create");
                    // console.logInt(newFlowToAffiliate);
                    newCtx = _createFlow(self,affiliate,newFlowToAffiliate,newCtx);
                    // console.log("Allocation to affiliate | Create | Stream Successful");
                } else {
                    // console.log("Allocation to affiliate | Update");
                    // console.logInt(newFlowToAffiliate);
                    newCtx = _updateFlow(self,affiliate,newFlowToAffiliate,newCtx);
                    // console.log("Allocation to affiliate | Update | Stream Successful");
                }

                // TODO: update variables at the end here. Like how you didn't update self.affiliateToOutflow[affiliate] and it breaks when a new flow is openned under same affiliate
                self.affiliateToOutflow[affiliate] = newFlowToAffiliate;

            } 
            // else (somehow they are using an invalid affiliate code)
            else {

                // start equivalent outflow to owner (program owner's wallet)
                int96 newFlowToOwner = currentFlowToOwner + newFlowFromSubscriber;

                if (currentFlowToOwner == 0) {
                    // console.log("Erratic Affiliate Code | Create | Equivalent outflow to owner");
                    newCtx = _createFlow(self,self.owner,newFlowToOwner,newCtx);
                } else {
                    // console.log("Erratic Affiliate Code | Update | Equivalent outflow to owner");
                    newCtx = _updateFlow(self,self.owner,newFlowToOwner,newCtx);
                }

            }
                
        }
        // (else) if there is not user data:
        else {
            // start equivalent outflow to owner (program owner's wallet)
            int96 newFlowToOwner = currentFlowToOwner + newFlowFromSubscriber;

            if (currentFlowToOwner == 0) {
                // console.log("Create | Equivalent outflow to owner");
                newCtx = _createFlow(self,self.owner,newFlowToOwner,newCtx);
            } else {
                // console.log("Update | Equivalent outflow to owner");
                newCtx = _updateFlow(self,self.owner,newFlowToOwner,newCtx);
            }

        }

        // update a mapping of subscriber => SubscriberProfile.inflowRate
        self.subscribers[subscriber].inflowRate = newFlowFromSubscriber;
        // update lastFlowRateToOwner in storage (not neccessary)
        // self.lastFlowRateToOwner = newFlowToOwner;

    }

        // @dev If an existing stream is updated
    function _updateOutflow(TradeableFlowStorage.AffiliateProgram storage self, bytes calldata ctx) internal returns (bytes memory newCtx) {
        newCtx = ctx;

        // Get associated tokenId in subscriber => subscribers.tokenId mapping
        address subscriber = self.host.decodeCtx(ctx).msgSender;
        uint256 tokenId = self.subscribers[subscriber].tokenId;

        // Get [affiliate] address associated with tokenId
        address affiliate = self.tokenToAffiliate[tokenId];
        
        // Get old flowRate from subscriber in subscriber => SubscriberProfile.inflowRate mapping
        int96 oldFlowFromSubscriber = self.subscribers[subscriber].inflowRate;

        // Get new flowRate from subscriber (ctx.msgSender) to this (subscriber inflow)
        (,int96 newFlowFromSubscriber,,) = self.cfa.getFlow(self.acceptedToken, subscriber, address(this));
        console.log("Incoming from Subscriber");
        console.logInt(newFlowFromSubscriber);

        // Get old flowRate to [affiliate] in affiliate => outflow mapping
        int96 currentFlowToAffiliate = self.affiliateToOutflow[affiliate];

        // Get current flowRate from this to owner (revenue) from lastFlowRateToOwner in storage
        (,int96 currentFlowToOwner,,) = self.cfa.getFlow(self.acceptedToken, address(this), self.owner);

        // if the affiliate address is not empty
        if (affiliate != address(0)) {

            // Get the [difference] between new flowRate from subscriber and old flowRate from subscriber
            int96 changeInFlowSubscriber = newFlowFromSubscriber - oldFlowFromSubscriber;

            // Calculate new flows to affiliate and owner as proportions of [difference] dictated by self.affiliatePortion
            int96 newFlowToOwner       = currentFlowToOwner     + ( changeInFlowSubscriber * (10000 - self.affiliatePortion) ) / 10000;
            int96 newFlowToAffiliate   = currentFlowToAffiliate + ( changeInFlowSubscriber *  self.affiliatePortion          ) / 10000;

            // increase/decrease the old flowRate to affiliate by [difference] amount in proportion to self.affiliatePortion - delete if zero
            if (newFlowToOwner != 0) {
                console.log("Deleting flow to owner");
                newCtx = _deleteFlow(self, address(this) , self.owner , newCtx);
            } else {
                newCtx = _updateFlow(self, self.owner , newFlowToOwner , newCtx);
            }

            // increase/decrease the current flowRate from this to owner (program owner's wallet) by [difference] amount in proportion to (1 - self.affiliatePortion) (revenue)
            if (newFlowToAffiliate == 0) {
                console.log("Deleting flow to affiliate");
                newCtx = _deleteFlow(self, address(this) , affiliate , newCtx);
            } else {
                newCtx = _updateFlow(self, affiliate , newFlowToAffiliate , newCtx);
            }

            // update a mapping of affiliate => outflow | this way you can keep track of affiliate outflow for future changes. This may be unneccessary with getFlow
            self.affiliateToOutflow[affiliate] = newFlowToAffiliate;   
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
            newCtx = _updateFlow(self,self.owner, newFlowToOwner, newCtx);
            console.log("Update | Adjusted portion owner flow | Stream Successful");
        }

        // update a mapping of subscriber => SubscriberProfile.inflowRate
        self.subscribers[subscriber].inflowRate = newFlowFromSubscriber;
        // update lastFlowRateToOwner in storage
        // self.lastFlowRateToOwner = newFlowToOwner;

    }

    // // @dev If an existing stream is terminated, likely same exact logic as _updateOutflow, need to confirm
    // function _terminateOutflow(bytes calldata ctx) internal returns (bytes memory newCtx) {
    //     // Get associated tokenId in subscriber => SubscriberProfile.tokenId mapping
    //     // Get [affiliate] address associated with tokenId

    //     // Get [old flowRate from subscriber] in subscriber => SubscriberProfile.inflowRate mapping

    //     // Get old flowRate to [affiliate] in affiliate => outflow mapping
    //     // Get current flowRate from this to owner (revenue) from lastFlowRateToOwner in storage

    //     // if the affiliate address is not empty

    //         // increase/decrease the old flowRate to affiliate by [old flowRate from subscriber] in proportion to _ap.affiliatePortion
    //         // increase/decrease the current flowRate from this to owner (program owner's wallet) by [old flowRate from subscriber] amount in proportion to (1 - _ap.affiliatePortion) (revenue)

    //         // update a mapping of affiliate => outflow | this way you can keep track of affiliate outflow for future changes. This may be unneccessary with getFlow
        
    //     // (else) if the affiliate address is empty

    //         // increase/decrease the outflow to owner (program owner's wallet) by [old flowRate from subscriber] amount. (revenue)

    //     // delete subscriber from subscribers mapping
    //     // update lastFlowRateToOwner in storage

    // }

    function _createFlow(
        TradeableFlowStorage.AffiliateProgram storage self,
        address to,
        int96 flowRate,
        bytes memory ctx
    ) internal returns (bytes memory newCtx) {
        (newCtx, ) = self.host.callAgreementWithContext(
            self.cfa,
            abi.encodeWithSelector(
                self.cfa.createFlow.selector,
                self.acceptedToken,
                to,
                flowRate,
                new bytes(0) // placeholder
            ),
            "0x",
            ctx
        );
    }

    function _updateFlow(
        TradeableFlowStorage.AffiliateProgram storage self,
        address to,
        int96 flowRate,
        bytes memory ctx
    ) internal returns (bytes memory newCtx) {
        (newCtx, ) = self.host.callAgreementWithContext(
            self.cfa,
            abi.encodeWithSelector(
                self.cfa.updateFlow.selector,
                self.acceptedToken,
                to,
                flowRate,
                new bytes(0) // placeholder
            ),
            "0x",
            ctx
        );
    }

    function _deleteFlow(
        TradeableFlowStorage.AffiliateProgram storage self,
        address from,
        address to,
        bytes memory ctx
    ) internal returns (bytes memory newCtx) {
        (newCtx, ) = self.host.callAgreementWithContext(
            self.cfa,
            abi.encodeWithSelector(
                self.cfa.deleteFlow.selector,
                self.acceptedToken,
                from,
                to,
                new bytes(0) // placeholder
            ),
            "0x",
            ctx
        );
    }

}