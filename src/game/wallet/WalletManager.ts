import { getAccount, watchAccount, connect, disconnect, getBalance, type GetAccountReturnType } from 'wagmi/actions';
import { config, appKit } from '../../config/wagmi';
import { injected } from 'wagmi/connectors';

export interface WalletState {
    address?: string;
    chainId?: number;
    isConnected: boolean;
    balance?: {
        formatted: string;
        symbol: string;
        value: bigint;
    };
}

class WalletManager {
    private static instance: WalletManager;
    private unwatch: (() => void) | null = null;
    private listeners: ((state: WalletState) => void)[] = [];

    private constructor() {
        this.init();
    }

    static getInstance(): WalletManager {
        if (!WalletManager.instance) {
            WalletManager.instance = new WalletManager();
        }
        return WalletManager.instance;
    }

    private init() {
        // Start watching account changes
        this.unwatch = watchAccount(config, {
            onChange: (account) => {
                this.notifyListeners(account);
            },
        });
    }

    public openModal() {
        appKit.open();
    }

    public async disconnect() {
        await disconnect(config);
    }

    public getAccount(): GetAccountReturnType {
        return getAccount(config);
    }

    public isConnected(): boolean {
        return getAccount(config).isConnected;
    }

    public getAddress(): string | undefined {
        return getAccount(config).address;
    }

    public subscribe(callback: (state: WalletState) => void): () => void {
        this.listeners.push(callback);
        // Initial call
        const account = getAccount(config);
        this.fetchBalance(account.address).then(balance => {
            callback({
                address: account.address,
                chainId: account.chainId,
                isConnected: account.isConnected,
                balance
            });
        });

        return () => {
            this.listeners = this.listeners.filter(l => l !== callback);
        };
    }

    private async notifyListeners(account: GetAccountReturnType) {
        const balance = await this.fetchBalance(account.address);
        const state: WalletState = {
            address: account.address,
            chainId: account.chainId,
            isConnected: account.isConnected,
            balance
        };

        this.listeners.forEach(listener => listener(state));
    }

    private async fetchBalance(address?: string) {
        if (!address) return undefined;
        try {
            const balance = await getBalance(config, { address: address as `0x${string}` });
            return {
                formatted: balance.formatted,
                symbol: balance.symbol,
                value: balance.value
            };
        } catch (e) {
            console.error('Error fetching balance', e);
            return undefined;
        }
    }
}

export const walletManager = WalletManager.getInstance();
