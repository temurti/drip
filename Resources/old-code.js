  // @dev Makes a new affiliate link and mints an NFT to the msg.sender
  // @notice The tokenID is to be used as the affiliate code
  // @return tokenId of the newly minted NFT
  // function makeAffiliateLink(address owner, string memory tokenUri, int96 outflowRate) public returns (uint tokenId) {
  //   require(owner != _ap.owner, "!owner");

  //   tokenIds.increment();
  //   tokenId = tokenIds.current();

  //   _mint(owner, tokenId);
  //   // _setTokenURI(tokenId, tokenUri);

  //   _ap.links[tokenId] = TradeableFlowStorage.Link(outflowRate, owner);

  // }

  Basic Flow Testing

          it("Alice starts a flow for 10 minutes, Bob receives right amount", async () => {
            console.log("Case 1: Alice starts a flow for 10 minutes, Bob receives right amount")
            const { alice , bob } = user_directory;
            const rate = 0.001

            // Upgrade all of Alice's DAI
            await upgrade([alice]);
            let initialAliceBal = await checkDAIXBalance(alice);

            // Get Bob's initial DAIx balance (it's zero)
            let initialBobBal = await checkDAIXBalance(bob);

            // START flow from Alice to Bob at 0.001 DAI/second
            await alice.flow({flowRate: toWad(rate) , recipient: bob});

            // Advance one minute
            console.log("Go forward 1 minute in time");
            await traveler.advanceTimeAndBlock(ONE_MINUTE);

            // STOP flow from Alice to Bob
            await alice.flow({flowRate: "0" , recipient: bob});

            // ASSERT: Bob's balance is increased by rate*time
            let currentBobBal = await checkDAIXBalance(bob);
            assert.equal(currentBobBal-initialBobBal,rate*(ONE_MINUTE+1)*TO_GWEI,"Bob's balance differs from expected");

            // ASSERT: Alice's balance is decreased by rate*time
            let currentAliceBal = await checkDAIXBalance(alice);
            assert.equal(initialAliceBal-currentAliceBal,rate*(ONE_MINUTE+1)*TO_GWEI,"Alice's balance differs from expected");

            // ASSERT: Alice's stream has ended
            assert.equal(
                (await alice.details()).cfa.netFlow,
                0,
                "Alice's stream hasn't ended!"
            )            
        });


        (,int96 testFlow,,) = _ap.cfa.getFlow(_ap.acceptedToken, 0x70997970C51812dc3A010C7d01b50e0d17dc79C8, address(this));

        console.log("Would Flow...");
        console.logInt(newFlowToOwner);
        console.log("Inflow...");
        console.logInt(newFlowFromSubscriber);
        console.logInt(testFlow);

                // await alice.flow({flowRate: toWad(rate) , recipient: user_directory.app, userData: encodedUserData});


            // increase/decrease the old flowRate to affiliate by [difference] amount in proportion to self.affiliatePortion
            console.log("Update | Adjusted portion affiliate flow");
            console.logInt( newFlowToAffiliate );
            newCtx = _updateFlow(self,affiliate, newFlowToAffiliate, newCtx);
            console.log("Update | Adjusted portion affiliate flow | Stream Successful");

            // increase/decrease the current flowRate from this to owner (program owner's wallet) by [difference] amount in proportion to (1 - self.affiliatePortion) (revenue)
            console.log("Update | Adjusted portion owner flow");
            console.logInt( newFlowToOwner );
            newCtx = _updateFlow(self,self.owner, newFlowToOwner, newCtx);
            console.log("Update | Adjusted portion owner flow | Stream Successful");



                // start necessary flows
                // if (currentFlowToOwner == 0) {
                //     // console.log("Allocation to owner | Create");
                //     // console.logInt(newFlowToOwner);
                //     newCtx = _createFlow(_ap.owner,newFlowToOwner,newCtx);
                //     // console.log("Allocation to owner | Create | Stream Successful");
                // } else {
                //     // console.log("Allocation to owner | Update");
                //     newCtx = _updateFlow(_ap.owner,newFlowToOwner,newCtx);
                //     // console.logInt(newFlowToOwner);
                //     // console.log("Allocation to owner | Update | Stream Successful");
                // }


                        // (else) if there is not user data (commented out because it's designed not to work if userData isn't provided)
        // else {
        //     // start equivalent outflow to owner (program owner's wallet)
        //     int96 newFlowToOwner = currentFlowToOwner + newFlowFromSubscriber;

        //     if (currentFlowToOwner == 0) {
        //         // console.log("Create | Equivalent outflow to owner");
        //         newCtx = _createFlow(_ap.owner,newFlowToOwner,newCtx);
        //     } else {
        //         // console.log("Update | Equivalent outflow to owner");
        //         newCtx = _updateFlow(_ap.owner,newFlowToOwner,newCtx);
        //     }

        // }