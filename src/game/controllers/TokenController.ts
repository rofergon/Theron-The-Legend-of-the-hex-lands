import { ContractService } from "../wallet/contractService";
import { walletManager, type WalletState } from "../wallet/WalletManager";
import type { HUDController } from "../ui/HUDController";
import type { SimulationSession } from "../core/SimulationSession";
import type { ToastNotification } from "../core/types";

// Snapshot of on-chain token balances
type OnChainSnapshot = { hex: number; theron: number };

/**
 * Dependencies required by the TokenController
 */
interface TokenDependencies {
  hud: HUDController;
  getSimulation: () => SimulationSession | null;
  logEvent: (message: string, notificationType?: ToastNotification["type"]) => void;
  onBalancesChanged: () => void;
}

/**
 * Manages token conversion from in-game Faith to on-chain HEX tokens
 * Handles wallet integration and balance polling
 */
export class TokenController {
  // Cached on-chain token balances
  private onChainBalances: OnChainSnapshot | null = null;
  // Polling interval for balance updates
  private onChainBalanceInterval: number | null = null;
  // Wallet subscription cleanup
  private unsubscribeWallet: (() => void) | null = null;

  // UI elements
  private token1Pill = document.querySelector<HTMLDivElement>("#token1-pill");
  private tokenModal = document.querySelector<HTMLDivElement>("#token-modal");
  private tokenModalBackdrop = document.querySelector<HTMLDivElement>("#token-modal-backdrop");
  private tokenModalClose = document.querySelector<HTMLButtonElement>("#token-modal-close");
  private tokenModalCancel = document.querySelector<HTMLButtonElement>("#token-modal-cancel");
  private tokenModalConvertAll = document.querySelector<HTMLButtonElement>("#token-convert-all");
  private tokenModalFaithValue = document.querySelector<HTMLSpanElement>("#token-modal-faith");
  private tokenModalRate = document.querySelector<HTMLSpanElement>("#token-modal-rate");
  private tokenModalStatus = document.querySelector<HTMLParagraphElement>("#token-modal-status");

  constructor(private readonly deps: TokenDependencies) { }

  /**
   * Initialize token UI and start balance polling
   */
  init() {
    this.setupTokenUI();
    this.startOnChainBalancePolling();

    // Subscribe to wallet changes
    this.unsubscribeWallet = walletManager.subscribe((state) => {
      this.handleWalletStateChange(state);
    });
  }

  /**
   * Clean up polling and close modal
   */
  destroy() {
    if (this.onChainBalanceInterval !== null) {
      window.clearInterval(this.onChainBalanceInterval);
      this.onChainBalanceInterval = null;
    }
    if (this.unsubscribeWallet) {
      this.unsubscribeWallet();
      this.unsubscribeWallet = null;
    }
    this.closeTokenModal();
  }

  /**
   * Reset cached balances
   */
  resetBalances() {
    this.onChainBalances = null;
  }

  /**
   * Get current token balances snapshot
   */
  getTokenSnapshot() {
    return this.onChainBalances ? { token1: this.onChainBalances.hex, token2: this.onChainBalances.theron } : null;
  }

  /**
   * Handle wallet state changes
   */
  private handleWalletStateChange(state: WalletState) {
    if (state.isConnected) {
      this.refreshOnChainBalances();
      this.updateTokenModalStats(); // Update modal if open
    } else {
      this.onChainBalances = null;
      this.updateUIBalances(0, 0);
      this.updateTokenModalStats();
    }
  }

  /**
   * Fetch latest on-chain balances and update UI
   */
  async refreshOnChainBalances() {
    if (!walletManager.isConnected()) return;

    try {
      // For now using strings from simulated service
      const hexStr = await ContractService.getHexBalance();
      const theronStr = await ContractService.getTheronBalance();

      const hex = parseFloat(hexStr);
      const theron = parseFloat(theronStr);

      this.updateUIBalances(hex, theron);

      this.onChainBalances = { hex, theron };
      this.deps.onBalancesChanged();
    } catch (error) {
      console.warn("Could not refresh on-chain balances:", error);
    }
  }

  private updateUIBalances(hex: number, theron: number) {
    const token1El = document.querySelector<HTMLSpanElement>("#token1-value");
    const token2El = document.querySelector<HTMLSpanElement>("#token2-value");
    if (token1El) token1El.textContent = hex.toFixed(2);
    if (token2El) token2El.textContent = theron.toFixed(2);
  }

  /**
   * Set up token modal UI and event listeners
   */
  private setupTokenUI() {
    const open = (event?: KeyboardEvent | MouseEvent) => {
      if (event && event.type === "keydown") {
        const key = (event as KeyboardEvent).key;
        if (key !== "Enter" && key !== " ") return;
        event.preventDefault();
      }
      this.openTokenModal();
    };
    this.token1Pill?.addEventListener("click", open);
    this.token1Pill?.addEventListener("keydown", open);
    this.tokenModalConvertAll?.addEventListener("click", this.convertAllFaithToToken1);
    this.tokenModalClose?.addEventListener("click", this.closeTokenModal);
    this.tokenModalCancel?.addEventListener("click", this.closeTokenModal);
    this.tokenModalBackdrop?.addEventListener("click", this.closeTokenModal);
  }

  /**
   * Open the token conversion modal
   */
  private openTokenModal = () => {
    const simulation = this.deps.getSimulation();
    if (!simulation || !this.tokenModal || !this.tokenModalBackdrop) {
      return;
    }
    this.updateTokenModalStats();
    this.tokenModal.classList.remove("hidden");
    this.tokenModalBackdrop.classList.remove("hidden");
  };

  /**
   * Close the token conversion modal
   */
  private closeTokenModal = () => {
    this.tokenModal?.classList.add("hidden");
    this.tokenModalBackdrop?.classList.add("hidden");
  };

  /**
   * Update modal statistics (Faith amount, conversion rate)
   */
  private updateTokenModalStats() {
    const simulation = this.deps.getSimulation();
    if (!simulation) return;
    const faith = simulation.getFaithSnapshot().value;
    const rate = simulation.getFaithConversionRate();
    if (this.tokenModalFaithValue) {
      this.tokenModalFaithValue.textContent = Math.floor(faith).toString();
    }
    if (this.tokenModalRate) {
      this.tokenModalRate.textContent = `${rate} Faith → 1 HEX`;
    }
    if (this.tokenModalStatus) {
      if (faith <= 0) {
        this.tokenModalStatus.textContent = "No stored Faith to convert.";
      } else if (!walletManager.isConnected()) {
        this.tokenModalStatus.textContent = "Connect wallet to convert Faith to HEX on-chain.";
      } else {
        this.tokenModalStatus.textContent = "Convert your Faith to HEX tokens on Base Sepolia.";
      }
    }
  }

  /**
   * Start periodic polling of on-chain balances (every 30 seconds)
   */
  private startOnChainBalancePolling() {
    if (this.onChainBalanceInterval !== null) return;
    this.onChainBalanceInterval = window.setInterval(() => {
      void this.refreshOnChainBalances();
    }, 30_000);
  }

  /**
   * Convert all available Faith to HEX tokens via on-chain transaction
   */
  convertAllFaithToToken1 = async () => {
    const simulation = this.deps.getSimulation();
    if (!simulation) {
      return;
    }

    const faithAmount = Math.floor(simulation.getFaithSnapshot().value);

    if (faithAmount <= 0) {
      this.deps.hud.updateStatus("No Faith available to convert.");
      this.closeTokenModal();
      return;
    }

    if (!walletManager.isConnected()) {
      if (this.tokenModalStatus) {
        this.tokenModalStatus.textContent = "Opening wallet...";
      }

      walletManager.openModal();
      // AppKit handles connection flow, we can't await it easily like a promise returning success
      // But we can rely on handleWalletStateChange to update the UI once connected
      return;
    }

    if (this.tokenModalConvertAll) {
      this.tokenModalConvertAll.disabled = true;
      this.tokenModalConvertAll.textContent = "Processing...";
      if (this.tokenModalStatus) this.tokenModalStatus.textContent = "Processing transaction...";
    }

    try {
      const result = await ContractService.convertFaithToHex(faithAmount);

      if (result.success && result.data?.hexReceived) {
        simulation.convertFaithToToken1();

        const hexReceived = result.data.hexReceived;

        this.deps.logEvent(
          `✨ Converted ${faithAmount} Faith into ${hexReceived} HEX tokens on-chain. ` +
          `TX: ${result.hash?.slice(0, 10)}...`,
        );
        this.deps.hud.showNotification(`¡${hexReceived} HEX tokens received!`, "success", 6000);
        this.showConversionSuccessAnimation(hexReceived);
        await this.refreshOnChainBalances();
        this.deps.onBalancesChanged();

        setTimeout(() => {
          this.closeTokenModal();
        }, 2000);
      } else {
        this.deps.hud.showNotification(result.error || "Error converting Faith to HEX", "critical", 5000);
      }
    } catch (error: any) {
      console.error("Error in convertAllFaithToToken1:", error);
      if (this.tokenModalStatus) {
        this.tokenModalStatus.textContent = `Error: ${error.message || "Unknown error"}`;
      }
      this.deps.hud.showNotification("Error converting Faith to HEX", "critical");
    } finally {
      if (this.tokenModalConvertAll) {
        this.tokenModalConvertAll.disabled = false;
        this.tokenModalConvertAll.textContent = "Convert all";
      }
    }
  };

  /**
   * Display animated success feedback with fireworks and coin flip
   */
  private showConversionSuccessAnimation(hexAmount: number) {
    if (!this.tokenModal) return;
    const anim = document.createElement("div");
    anim.className = "conversion-success-anim";
    anim.innerHTML = `
      <div class="fireworks">
        <div class="firework"></div>
        <div class="firework"></div>
        <div class="firework"></div>
        <div class="firework"></div>
        <div class="firework"></div>
        <div class="firework"></div>
      </div>
      <div class="coin-3d">
        <div class="face front"><img src="/assets/extracted_icons/Hex_Token.png" alt="HEX token" /></div>
        <div class="face back"><img src="/assets/extracted_icons/Hex_Token.png" alt="HEX token" /></div>
        <div class="edge"></div>
      </div>
      <div class="celebrate-text">+${hexAmount.toFixed(2)} HEX</div>
    `;
    this.tokenModal.appendChild(anim);
    setTimeout(() => anim.remove(), 4000);
  }
}
