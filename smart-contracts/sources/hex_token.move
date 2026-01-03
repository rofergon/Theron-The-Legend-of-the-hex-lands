/// HexToken (Token débil, inflacionario)
/// Token interno del juego generado principalmente vía conversión de Faith
/// Usado para construcciones, mejoras, boosts y otras acciones in-game
module theron_game::hex_token {
    use sui::coin::{Self, Coin, TreasuryCap};
    use sui::tx_context::{Self, TxContext};
    use sui::transfer;
    use sui::object::{Self, UID};
    use sui::balance::{Self, Balance};
    use std::option;

    /// Token HEX - moneda débil del juego
    public struct HEX_TOKEN has drop {}

    /// Capacidad de control del treasury
    public struct TreasuryCapHolder has key {
        id: UID,
        treasury_cap: TreasuryCap<HEX_TOKEN>,
        /// Dirección autorizada para mint (backend game server)
        authorized_minter: address,
    }

    /// Estadísticas de la economía
    public struct EconomyStats has key {
        id: UID,
        total_minted: u64,
        total_burned: u64,
        faith_converted: u64,
    }

    /// Evento: Mint desde conversión de Faith
    public struct FaithConverted has copy, drop {
        player: address,
        faith_amount: u64,
        hex_minted: u64,
    }

    /// Evento: Burn de tokens
    public struct TokensBurned has copy, drop {
        player: address,
        amount: u64,
        reason: vector<u8>, // "upgrade", "boost", "conversion", etc.
    }

    /// Inicialización del módulo (se ejecuta una vez al publicar)
    fun init(witness: HEX_TOKEN, ctx: &mut TxContext) {
        // Crear el treasury cap con 9 decimales
        let (treasury_cap, metadata) = coin::create_currency(
            witness,
            9, // decimales
            b"HEX",
            b"Hex Token",
            b"In-game currency for Theron. Generated from Faith and used for upgrades, boosts, and construction.",
            option::none(),
            ctx
        );

        // Transferir metadata público
        transfer::public_freeze_object(metadata);

        // Guardar el treasury cap con autorización
        let holder = TreasuryCapHolder {
            id: object::new(ctx),
            treasury_cap,
            authorized_minter: tx_context::sender(ctx), // Inicialmente el deployer
        };
        transfer::share_object(holder);

        // Inicializar estadísticas
        let stats = EconomyStats {
            id: object::new(ctx),
            total_minted: 0,
            total_burned: 0,
            faith_converted: 0,
        };
        transfer::share_object(stats);
    }

    /// Actualizar el minter autorizado (solo admin)
    public entry fun update_authorized_minter(
        holder: &mut TreasuryCapHolder,
        new_minter: address,
        ctx: &TxContext
    ) {
        assert!(tx_context::sender(ctx) == holder.authorized_minter, 1); // E_NOT_AUTHORIZED
        holder.authorized_minter = new_minter;
    }

    /// Mint de HEX tokens desde conversión de Faith (solo backend autorizado)
    /// El backend valida off-chain que el jugador tiene suficiente Faith
    public entry fun mint_from_faith(
        holder: &mut TreasuryCapHolder,
        stats: &mut EconomyStats,
        faith_amount: u64,
        conversion_rate: u64, // e.g., 100 Faith = 1 HEX (rate = 100)
        recipient: address,
        ctx: &mut TxContext
    ) {
        assert!(tx_context::sender(ctx) == holder.authorized_minter, 1); // E_NOT_AUTHORIZED
        
        // Calcular HEX a mintear (faith_amount / conversion_rate)
        let hex_amount = faith_amount / conversion_rate;
        assert!(hex_amount > 0, 2); // E_ZERO_AMOUNT

        // Mintear tokens
        let coin = coin::mint(&mut holder.treasury_cap, hex_amount, ctx);
        transfer::public_transfer(coin, recipient);

        // Actualizar stats
        stats.total_minted = stats.total_minted + hex_amount;
        stats.faith_converted = stats.faith_converted + faith_amount;

        // Emitir evento
        sui::event::emit(FaithConverted {
            player: recipient,
            faith_amount,
            hex_minted: hex_amount,
        });
    }

    /// Mint de HEX tokens desde conversión de Faith (versión pública para testnet)
    /// ADVERTENCIA: Esta función NO valida que el jugador tenga Faith.
    /// Solo para uso en testnet/demo. El sender recibe los tokens.
    public entry fun mint_from_faith_public(
        holder: &mut TreasuryCapHolder,
        stats: &mut EconomyStats,
        faith_amount: u64,
        conversion_rate: u64,
        ctx: &mut TxContext
    ) {
        // Calcular HEX a mintear
        let hex_amount = faith_amount / conversion_rate;
        assert!(hex_amount > 0, 2); // E_ZERO_AMOUNT

        let recipient = tx_context::sender(ctx);

        // Mintear tokens
        let coin = coin::mint(&mut holder.treasury_cap, hex_amount, ctx);
        transfer::public_transfer(coin, recipient);

        // Actualizar stats
        stats.total_minted = stats.total_minted + hex_amount;
        stats.faith_converted = stats.faith_converted + faith_amount;

        // Emitir evento
        sui::event::emit(FaithConverted {
            player: recipient,
            faith_amount,
            hex_minted: hex_amount,
        });
    }

    /// Quemar HEX tokens (para upgrades, consumos, conversión a THERON)
    public entry fun burn_tokens(
        holder: &mut TreasuryCapHolder,
        stats: &mut EconomyStats,
        coin: Coin<HEX_TOKEN>,
        reason: vector<u8>,
        ctx: &TxContext
    ) {
        let amount = coin::value(&coin);
        coin::burn(&mut holder.treasury_cap, coin);

        // Actualizar stats
        stats.total_burned = stats.total_burned + amount;

        // Emitir evento
        sui::event::emit(TokensBurned {
            player: tx_context::sender(ctx),
            amount,
            reason,
        });
    }

    /// Split de coins para preparar pagos
    public entry fun split_coin(
        coin: &mut Coin<HEX_TOKEN>,
        amount: u64,
        ctx: &mut TxContext
    ) {
        let split = coin::split(coin, amount, ctx);
        transfer::public_transfer(split, tx_context::sender(ctx));
    }

    /// Merge de coins
    public entry fun merge_coins(
        coin: &mut Coin<HEX_TOKEN>,
        other: Coin<HEX_TOKEN>,
    ) {
        coin::join(coin, other);
    }

    // === Getters públicos ===
    
    public fun get_total_minted(stats: &EconomyStats): u64 {
        stats.total_minted
    }

    public fun get_total_burned(stats: &EconomyStats): u64 {
        stats.total_burned
    }

    public fun get_faith_converted(stats: &EconomyStats): u64 {
        stats.faith_converted
    }

    public fun get_circulating_supply(stats: &EconomyStats): u64 {
        stats.total_minted - stats.total_burned
    }

    // === Tests ===
    #[test_only] use sui::test_scenario;

    #[test]
    fun test_init_sets_admin_and_stats() {
        let admin = @0xA;
        let mut scenario = test_scenario::begin(admin);
        {
            init(HEX_TOKEN {}, scenario.ctx());
        };

        scenario.next_tx(admin);
        {
            let holder = scenario.take_shared<TreasuryCapHolder>();
            let stats = scenario.take_shared<EconomyStats>();

            assert!(holder.authorized_minter == admin, 100);
            assert!(stats.total_minted == 0 && stats.total_burned == 0 && stats.faith_converted == 0, 101);

            transfer::share_object(holder);
            transfer::share_object(stats);
        };
        scenario.end();
    }

    #[test]
    fun test_mint_and_burn_flow() {
        let admin = @0xA;
        let minter = @0xB;
        let player = @0xC;

        // Deploy package
        let mut scenario = test_scenario::begin(admin);
        {
            init(HEX_TOKEN {}, scenario.ctx());
        };

        // Admin delega minteo al backend autorizado
        scenario.next_tx(admin);
        {
            let mut holder = scenario.take_shared<TreasuryCapHolder>();
            let stats = scenario.take_shared<EconomyStats>();
            update_authorized_minter(&mut holder, minter, scenario.ctx());
            transfer::share_object(holder);
            transfer::share_object(stats);
        };

        // Backend mintea para el jugador usando conversión de Faith
        scenario.next_tx(minter);
        {
            let mut holder = scenario.take_shared<TreasuryCapHolder>();
            let mut stats = scenario.take_shared<EconomyStats>();
            mint_from_faith(&mut holder, &mut stats, 200, 100, player, scenario.ctx()); // 2 HEX
            transfer::share_object(holder);
            transfer::share_object(stats);
        };

        // Jugador recibe y quema los tokens
        scenario.next_tx(player);
        {
            let mut holder = scenario.take_shared<TreasuryCapHolder>();
            let mut stats = scenario.take_shared<EconomyStats>();
            let coin: Coin<HEX_TOKEN> = scenario.take_from_sender();
            assert!(coin::value(&coin) == 2, 102);

            burn_tokens(&mut holder, &mut stats, coin, b"upgrade", scenario.ctx());
            assert!(get_total_minted(&stats) == 2, 103);
            assert!(get_total_burned(&stats) == 2, 104);
            assert!(get_faith_converted(&stats) == 200, 105);

            transfer::share_object(holder);
            transfer::share_object(stats);
        };
        scenario.end();
    }

    #[test, expected_failure(abort_code = 1)]
    fun test_mint_requires_authorized_minter() {
        let admin = @0xA;
        let attacker = @0xB;

        let mut scenario = test_scenario::begin(admin);
        {
            init(HEX_TOKEN {}, scenario.ctx());
        };

        // Attacker intenta mintear sin ser el authorized_minter
        scenario.next_tx(attacker);
        {
            let mut holder = scenario.take_shared<TreasuryCapHolder>();
            let mut stats = scenario.take_shared<EconomyStats>();
            mint_from_faith(&mut holder, &mut stats, 100, 50, attacker, scenario.ctx());
            transfer::share_object(holder);
            transfer::share_object(stats);
        };
        scenario.end();
        abort 1;
        // Abort esperado por E_NOT_AUTHORIZED (código 1)
    }
}
