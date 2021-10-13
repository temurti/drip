import Web3 from 'web3';
import React, { Component } from 'react';
import { Navbar, Container} from 'react-bootstrap';
import './App.css';
import { appAddress, fUSDCxAddress, fDAIxAddress } from "./rinkeby_config";
import { tradeableFlowABI } from "./abis"

const SuperfluidSDK = require("@superfluid-finance/js-sdk");
const { Web3Provider } = require("@ethersproject/providers");

class App extends Component {

  constructor(props) {
    super(props);
    this.state = {
      notConnected: null,
      web3: null, 
      account: '',
      accounts: [],
      owner:'',
      drip:'',
      sf:null
    }


    this.mintNFT = this.mintNFT.bind(this)
    this.transferNFT = this.transferNFT.bind(this)
    this.setNewAcceptableToken = this.setNewAcceptableToken.bind(this)
    this.getOwner = this.getOwner.bind(this)
    this.getDrip = this.getDrip.bind(this)
    this.startFlow = this.startFlow.bind(this)
    this.getAffiliateCodeFromTokenId = this.getAffiliateCodeFromTokenId.bind(this)
    this.setERC20MintRestrictions = this.setERC20MintRestrictions.bind(this)
  }

  componentDidMount() {
    this.loadData();
  }

  async loadData() {

    const web3 = new Web3(window.ethereum)
    // WEB3 SET UP
    //TODO: handle network switch

    // Connecting to browser injected web3
    await window.ethereum.enable()
    this.setState({notConnected:false})
    this.setState({web3:web3})

    // Gettin user account
    await web3.eth.getAccounts((error,accounts) => {
      this.setState({account:accounts[0]})
      this.setState({accounts:accounts})
      console.log(accounts)
    })

    // Initializing Superfluid framework
    const sf = new SuperfluidSDK.Framework({
      ethers: new Web3Provider(window.ethereum),
      tokens: ["fUSDC","fDAI"]
    });
    await sf.initialize()
    this.setState({sf:sf})

    this.setState({NFTUrl:`https://rinkeby.etherscan.io/token/${appAddress}?a=${this.state.account}`})

    await this.getOwner()
    await this.getDrip()

    window.ethereum.on('accountsChanged', function (accounts) {
      // Re-do the WEB3 SET UP if accounts are changed
      window.location.reload()
    }.bind(this))

  }

  // Gets the owner of the affiliate program as an FYI when you're swapping around addresses
  async getOwner() {
    var appInst = new this.state.web3.eth.Contract(tradeableFlowABI,appAddress)

    appInst.methods.owner().call(function(err, res){
      console.log("Program Owner:",res)
      document.getElementById("owner").innerHTML = res
    });
  }

  // Gets the Drip program manager
  async getDrip() {
    var appInst = new this.state.web3.eth.Contract(tradeableFlowABI,appAddress)
    
    appInst.methods.drip().call(function(err, res){
      console.log("Drip Owner:",res)
      document.getElementById("drip").innerHTML = res
    });
  }


  async mintNFT() {
    var appInst = new this.state.web3.eth.Contract(tradeableFlowABI,appAddress)
    var tokenURI = document.getElementById("tokenURI").value

    await appInst
    .methods.mint(
      tokenURI
    ).send({ from: this.state.account })

    document.getElementById("tokenURI").value = ""
  }

  async transferNFT() {
    var appInst = new this.state.web3.eth.Contract(tradeableFlowABI,appAddress)
    var transferAddress = document.getElementById("transferAddress").value
    var tokenId = document.getElementById("tokenId").value

    await appInst
    .methods.safeTransferFrom(
      this.state.account,
      transferAddress,
      tokenId      
    ).send({ from: this.state.account })

    document.getElementById("transferAddress").value = ""
    document.getElementById("tokenId").value = ""

  }

  async setNewAcceptableToken() {
    var appInst = new this.state.web3.eth.Contract(tradeableFlowABI,appAddress)
    var tokenAddress = document.getElementById("tokenAddress").value

    await appInst
    .methods.setNewAcceptedToken(
      tokenAddress
    ).send({ from: this.state.account })

    document.getElementById("tokenAddress").value = ""
  }

  async setERC20MintRestrictions() {
    var appInst = new this.state.web3.eth.Contract(tradeableFlowABI,appAddress)
    var tokenAddress = document.getElementById("newERC20MintRestrict").value
    var newBalReq = document.getElementById("newERC20MintRestrictBalanceRequirement").value

    await appInst
    .methods.setERC20MintRestriction(
      newBalReq,
      tokenAddress
    ).send({ from: this.state.account })

    document.getElementById("newERC20MintRestrict").value = ""
    document.getElementById("newERC20MintRestrictBalanceRequirement").value = ""

  }

  async getAffiliateCodeFromTokenId() {
    var appInst = new this.state.web3.eth.Contract(tradeableFlowABI,appAddress)
    var tokenId = document.getElementById("getTokenId").value


    appInst.methods.tokenURI(tokenId).call(function(err, res){
      let out = `URI for Token ${tokenId}: ${res}`
      console.log(out)
      document.getElementById("getTokenIdResult").innerHTML = out
    });

  }


  async startFlow() {
    var affCode = document.getElementById("affCode").value
    var flowRate = Math.round( ( document.getElementById("flowRate").value * Math.pow(10,18) ) / 2592000 )
    var paymentToken = document.getElementById("paymentToken").value

    console.log(flowRate)
    let affiliateCode = this.state.web3.eth.abi.encodeParameter('string',affCode)

    console.log(paymentToken)
    
    await this.state.sf.cfa.createFlow({
      superToken:   paymentToken, 
      sender:       this.state.account,
      receiver:     appAddress,
      flowRate:     flowRate.toString(),
      userData:     affiliateCode
    });

  }

  async getAppNetFlow() {
    
  }

  render() {
    return (
      <div>

        <Navbar collapseOnSelect expand="lg" bg="dark" variant="dark">
          <Container>
          <Navbar.Brand>Affiliate NFT Minting Interface</Navbar.Brand>
          <br></br>
          <Navbar.Text>Your Address: <strong>{this.state.account.substring(0,8)}</strong>...</Navbar.Text>
          </Container>
        </Navbar>
        
        <br></br>

        <body>

          <table id = "mint-table">
            <tr>
              <th>Chose your affiliate code and mint</th>
            </tr>
            <tr>
              <td><input type="text" id="tokenURI"/></td>
              <td><button id="mint-button" onClick={this.mintNFT}>Mint</button></td>
            </tr>
          </table>

          <br></br>

          <table id = "transfer-table">
            <tr>
              <th>Transfer your affiliate NFT to someone else</th>
              <th></th>
              <th></th>
            </tr>
            <tr>
              <td>To:</td>
              <td>Token ID:</td>
              <td></td>
            </tr>
            <tr>
              <td><input type="text" id="transferAddress"/></td>
              <td><input type="text" id="tokenId"/></td>
              <td><button id="transfer-button" onClick={this.transferNFT}>Transfer</button></td>
            </tr>
          </table>

          <br></br>

          <table id = "ercc20restrict-table">
            <tr>
              <th>Set ERC20 Mint Restrictions (must be done before potential affiliates can mint)</th>
              <th></th>
              <th></th>
            </tr>
            <tr>
              <td>ERC20 Restrict Address</td>
              <td>Balance Requirement</td>
              <td></td>
            </tr>
            <tr>
              <td><input type="text" id="newERC20MintRestrict"/></td>
              <td><input type="text" id="newERC20MintRestrictBalanceRequirement"/></td>
              <td><button id="seterc20restrict-button" onClick={this.setERC20MintRestrictions}>Set</button></td>
            </tr>
          </table>

          <br></br>

          <table id = "set-new-acceptable-token-table">
            <tr>
              <th>Provide address of new token you'd be willing to accept as payment for your affiliate program</th>
            </tr>
            <tr>
              <td>Super Token Address:</td>
            </tr>
            <tr>
              <td><input type="text" id="tokenAddress"/></td>
              <td><button id="set-button" onClick={this.setNewAcceptableToken}>Set</button></td>
            </tr>
          </table>

          <br></br>

          <table id = "flow-table">
            <tr>
              <th>Start a flow to the SuperApp</th>
            </tr>
            <tr>
              <td>Affiliate Code (Optional):</td>
              <td>Flow Rate</td>
            </tr>
            <tr>
              <td><input type="text" id="affCode"/></td>
              <td><input type="number" id="flowRate"/></td>
              <td>
                <select name="paymentToken" id="paymentToken">
                  <option value={fUSDCxAddress}>USDCx</option>
                  <option value={fDAIxAddress}>DAIx</option>
                  {/* <option value="mercedes">Mercedes</option>
                  <option value="audi">Audi</option> */}
                </select>
              </td>
              <td><button id="set-button" onClick={this.startFlow}>Start Flow</button></td>
            </tr>
          </table>

          <br></br>

          <table id = "get-uri">
            <tr>
              <th>Get URI from Token ID</th>
            </tr>
            <tr>
              <td>Token ID</td>
            </tr>
            <tr>
              <td><input type="number" id="getTokenId"/></td>
              <td><button id="set-button" onClick={this.getAffiliateCodeFromTokenId}>Get</button></td>
            </tr>
            <tr>
              <td id="getTokenIdResult"></td>
            </tr>
          </table>

          <br></br>

          <a href={this.state.NFTUrl}>If you're an affiliate, view your affiliate NFTs here on etherscan</a>

          <br></br>

          <p>Program Owner</p>
          <p id="owner"></p>
          <p>Drip Owner</p>
          <p id="drip"></p>


        </body>

      </div>
    )
  }

}

export default App; 