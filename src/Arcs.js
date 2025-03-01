import Utils from "./Utils";
import verifyArgs from "./verifyArgs";
import TxnVerifer from "./TxnVerifier";
const algosdk =  require('algosdk/dist/cjs');
export default class Arcs{

    constructor(algoWallet, walletFuncs){
        this.wallet = algoWallet;
        this.walletFuncs = walletFuncs
    }

    async signTxns(TxnObjs, originString){
        //txObject defined in Algorand Arc 1
        //https://arc.algorand.foundation/ARCs/arc-0001
        
        
        const Txn_Verifer = new TxnVerifer();
        
        let msg = "Do you want to sign transactions from "+originString+"?"
        const confirm = await Utils.sendConfirmation("sign TXNS?", this.wallet.network, msg);
        if(!confirm){
            Utils.throwError(4001, "user rejected Request");
        }
        let signedTxns = [];
        let firstGroup = null;
        let firstLoop = true;
        for(let txn of TxnObjs){
            const verifiedArgs = verifyArgs(txn, firstLoop);
            
            
            if(firstLoop){
                firstGroup = txn.txn.group;
                firstLoop = false;
            }
            else{
                //check that group Ids all match
                if(txn.txn.group !== undefined){
                    for(let i = 0; i<txn.txn.group.length; i++){
                        if(txn.group[i] !== firstGroup[i]){
                            Utils.notify("Error: Transaction Group Mismatch");
                            Utils.throwError(4300, "Transaction Groups do not match");
                        }
                    }
                    
                }
                else{
                    if(firstGroup !== null || firstGroup !== undefined){
                        Utils.notify("Error: Transaction Group Mismatch");
                        Utils.throwError(4300, "Transaction Groups do not match");
                    }
                }
            }
            if(verifiedArgs.message){
                msg = verifiedArgs.message;
                const confirmed = await Utils.sendConfirmation("Transaction Message", "Transaction Message", msg);
                if(!confirmed){
                    Utils.throwError(4001, "user rejected Request");
                }
            }
            let txnBuffer = Buffer.from(txn.txn, 'base64');
            let decoded_txn = algosdk.decodeUnsignedTransaction(txnBuffer);

            let verifiedObj = Txn_Verifer.verifyTxn(decoded_txn, await this.walletFuncs.getSpendable());

            if(txn.message){
                const msgConfirmation = await Utils.sendConfirmation("Untrusted Message", originString+" says:", txn.message)
                if(!msgConfirmation){
                    Utils.throwError(4001, "user rejected Request");
                }
            }
            if(txn.signers){
                if(Array.isArray(txn.signers) && txn.signers.length === 0){
                    signedTxns.push(null);
                }
            }
            if(verifiedObj.valid === true){
                for(let warning of verifiedObj.warnings){
                    let confirmWarning = await Utils.sendConfirmation("warning", "txn Warning", warning);
                    if(!confirmWarning){
                        Utils.throwError(4001, "user rejected Request");
                    }
                }
                for(let info of verifiedObj.info){
                    let confirmInfo = await Utils.sendConfirmation("info", "txn Info", info);
                    if(!confirmInfo){
                        Utils.throwError(4001, "user rejected Request");
                    }
                }
                let signedTxn = decoded_txn.signTxn(this.wallet.sk)
                
                const b64signedTxn = Buffer.from(signedTxn).toString('base64');
                signedTxns.push(b64signedTxn);
            }
            else{
                await Utils.sendAlert("Txn Signing failed", JSON.stringify(verifiedObj.error[0]))
                return Utils.throwError(4300, JSON.stringify(verifiedObj.error[0]));
            }
        }
        return signedTxns;
    }

    async postTxns(stxns){
        stxns = stxns.map(stxB64 => Buffer.from(stxB64, "base64"))
        const ogTxn = algosdk.decodeSignedTransaction(stxns[0]).txn;
        if(ogTxn.genesisID === "testnet-v1.0"){
            this.wallet.setTestnet(true);
        }
        const algod = this.wallet.getAlgod()
        const result = (await algod.sendRawTransaction(stxns).do())
        const txId = result.txId;
        if(txId === undefined){
            await Utils.sendConfirmation("Invalid Transaction", "Invalid Transaction", result.message);
            Utils.throwError(4300, result.message);
        }
        try{
            await algosdk.waitForConfirmation(algod, txId, 4)
            Utils.notify("transaction was successful \n"+result['confirmed-round']);
        }
        catch(e){
            Utils.notify("transaction submission failed");
        }
        return txId;
    }

    async signAndPostTxns(txns, originString){
        const signedTxns = await this.signTxns(txns, originString);
        let txId = await this.postTxns(signedTxns);
        return txId;
    }
}