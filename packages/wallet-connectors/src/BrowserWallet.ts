import { detectConcordiumProvider, WalletApi } from '@concordium/browser-wallet-api-helpers';
import {
    AccountTransactionPayload,
    AccountTransactionSignature,
    AccountTransactionType,
    SchemaVersion,
} from '@concordium/web-sdk';
import { WalletConnectionDelegate, WalletConnection, WalletConnector } from './WalletConnection';

const BROWSER_WALLET_DETECT_TIMEOUT = 2000;

/**
 * Implementation of both {@link WalletConnector} and {@link WalletConnection} for the Concordium Browser Wallet.
 * Implementing both interfaces in the same class is a good fit for this protocol
 * as all interaction with the wallet's API happens through a single stateful client.
 */
export class BrowserWalletConnector implements WalletConnector, WalletConnection {
    readonly client: WalletApi;

    readonly delegate: WalletConnectionDelegate;

    isConnected = false;

    /**
     * Construct a new instance.
     *
     * Use {@link create} to have the API client initialized automatically.
     *
     * The constructor sets up event handling and appropriate forwarding to the provided delegate.
     *
     * @param client The underlying API client.
     * @param delegate The object to receive events emitted by the client.
     */
    constructor(client: WalletApi, delegate: WalletConnectionDelegate) {
        this.client = client;
        this.delegate = delegate;

        this.client.on('chainChanged', (c) => delegate.onChainChanged(this, c));
        this.client.on('accountChanged', (a) => delegate.onAccountChanged(this, a));
        this.client.on('accountDisconnected', () =>
            this.client
                .getMostRecentlySelectedAccount()
                .then((a) => delegate.onAccountChanged(this, a))
                .catch(console.error)
        );
    }

    static async create(delegate: WalletConnectionDelegate) {
        try {
            const client = await detectConcordiumProvider(BROWSER_WALLET_DETECT_TIMEOUT);
            return new BrowserWalletConnector(client, delegate);
        } catch (e) {
            // Provider detector throws 'undefined' when rejecting!
            throw new Error('Browser Wallet extension not detected');
        }
    }

    async connect() {
        const account = await this.client.connect();
        if (!account) {
            throw new Error('Browser Wallet connection failed');
        }
        this.isConnected = true;
        this.delegate.onConnected(this, account);
        return this;
    }

    getConnections() {
        return this.isConnected ? [this] : [];
    }

    getConnector() {
        return this;
    }

    async ping() {
        return undefined;
    }

    /**
     * @return The account that the wallet currently associates with this connection.
     */
    async getConnectedAccount() {
        return this.client.getMostRecentlySelectedAccount();
    }

    getJsonRpcClient() {
        return this.client.getJsonRpcClient();
    }

    /**
     * Deregister event handlers on the API client and notify the delegate.
     * As there's no way to actually disconnect the Browser Wallet, this is all that we can reasonably do.
     * The client object will remain in the browser's global state.
     */
    async disconnect() {
        // The connection itself cannot actually be disconnected by the dApp as
        // only the wallet can initiate disconnecting individual accounts.
        // This "disconnect" only ensures that we stop interacting with the client
        // (which stays in the browser window's global state)
        // such that it doesn't interfere with a future reconnection.
        this.isConnected = false;
        this.client.removeAllListeners();
        this.delegate.onDisconnected(this);
    }

    async signAndSendTransaction(
        accountAddress: string,
        type: AccountTransactionType,
        payload: AccountTransactionPayload,
        parameters?: Record<string, unknown>,
        schema?: string,
        schemaVersion?: SchemaVersion
    ): Promise<string> {
        try {
            if (
                (type === AccountTransactionType.InitContract || type === AccountTransactionType.Update) &&
                parameters !== undefined &&
                schema !== undefined
            ) {
                return this.client.sendTransaction(accountAddress, type, payload, parameters, schema, schemaVersion);
            }
            return this.client.sendTransaction(accountAddress, type, payload);
        } catch (error: any) {
            console.log('errorerrorneee', error);
            throw new Error(error);
        }
    }

    async signMessage(accountAddress: string, message: string): Promise<AccountTransactionSignature> {
        try {
            return this.client.signMessage(accountAddress, message);
        } catch (error: any) {
            console.log('errorerrorneee222', error);
            throw new Error(error);
        }
    }
}
