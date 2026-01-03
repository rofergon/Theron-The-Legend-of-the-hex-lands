/// TheronToken (Token fuerte, supply limitado)
/// Token premium usado para comprar Lands, Chests y acceso a contenido premium
/// Puede ser minteado quemando grandes cantidades de HEX
module theron_game::theron_token {
    use sui::coin::{Self, Coin, TreasuryCap};
    use sui::tx_context::{Self, TxContext};
    use sui::transfer;
    use sui::object::{Self, UID};
    use sui::balance::{Self, Balance};

    /// Token THERON - moneda fuerte del juego
    public struct THERON_TOKEN has drop {}

    /// Capacidad de control del treasury
    public struct TreasuryCapHolder has key {
        id: UID,
        treasury_cap: TreasuryCap<THERON_TOKEN>,
        /// Dirección autorizada para mint
        authorized_minter: address,
        /// Supply máximo (0 = sin límite)
        max_supply: u64,
        /// Ratio de conversión HEX -> THERON (ejemplo: 100000 HEX = 1 THERON)
        conversion_ratio: u64,
    }

    /// Estadísticas
    public struct TheronStats has key {
        id: UID,
        total_minted: u64,
        total_burned: u64,
        hex_burned_for_conversion: u64,
        lands_purchased: u64,
        chests_purchased: u64,
    }

    /// Evento: Conversión de HEX a THERON
    public struct HexConverted has copy, drop {
        player: address,
        hex_burned: u64,
        theron_minted: u64,
    }

    /// Evento: Compra realizada
    public struct PurchaseMade has copy, drop {
        player: address,
        item_type: vector<u8>, // "land", "chest"
        amount_spent: u64,
    }

    /// Evento: Tokens quemados
    public struct TheronBurned has copy, drop {
        player: address,
        amount: u64,
        reason: vector<u8>,
    }

    /// Inicialización
    fun init(witness: THERON_TOKEN, ctx: &mut TxContext) {
        let (treasury_cap, metadata) = coin::create_currency(
            witness,
            9, // decimales
            b"THERON",
            b"Theron Token",
            b"Premium currency for Theron game. Used for Lands, Chests, and exclusive content.",
            option::none(),
            ctx
        );

        transfer::public_freeze_object(metadata);

        let holder = TreasuryCapHolder {
            id: object::new(ctx),
            treasury_cap,
            authorized_minter: tx_context::sender(ctx),
            max_supply: 0, // Sin límite inicial, configurable después
            conversion_ratio: 100000, // 100k HEX = 1 THERON por defecto
        };
        transfer::share_object(holder);

        let stats = TheronStats {
            id: object::new(ctx),
            total_minted: 0,
            total_burned: 0,
            hex_burned_for_conversion: 0,
            lands_purchased: 0,
            chests_purchased: 0,
        };
        transfer::share_object(stats);
    }

    /// Configurar parámetros (solo admin)
    public entry fun configure(
        holder: &mut TreasuryCapHolder,
        max_supply: u64,
        conversion_ratio: u64,
        ctx: &TxContext
    ) {
        assert!(tx_context::sender(ctx) == holder.authorized_minter, 1); // E_NOT_AUTHORIZED
        holder.max_supply = max_supply;
        holder.conversion_ratio = conversion_ratio;
    }

    /// Actualizar minter autorizado
    public entry fun update_authorized_minter(
        holder: &mut TreasuryCapHolder,
        new_minter: address,
        ctx: &TxContext
    ) {
        assert!(tx_context::sender(ctx) == holder.authorized_minter, 1);
        holder.authorized_minter = new_minter;
    }

    /// Mint directo (solo para venta inicial o rewards especiales)
    public entry fun mint_direct(
        holder: &mut TreasuryCapHolder,
        stats: &mut TheronStats,
        amount: u64,
        recipient: address,
        ctx: &mut TxContext
    ) {
        assert!(tx_context::sender(ctx) == holder.authorized_minter, 1);
        
        // Verificar max supply si está configurado
        if (holder.max_supply > 0) {
            assert!(stats.total_minted + amount <= holder.max_supply, 3); // E_MAX_SUPPLY_EXCEEDED
        };

        let coin = coin::mint(&mut holder.treasury_cap, amount, ctx);
        transfer::public_transfer(coin, recipient);

        stats.total_minted = stats.total_minted + amount;
    }

    /// Conversión de HEX a THERON (quema HEX off-chain, mintea THERON on-chain)
    /// El backend valida el burn de HEX antes de llamar esta función
    public entry fun mint_from_hex_burn(
        holder: &mut TreasuryCapHolder,
        stats: &mut TheronStats,
        hex_burned: u64,
        recipient: address,
        ctx: &mut TxContext
    ) {
        assert!(tx_context::sender(ctx) == holder.authorized_minter, 1);
        
        // Calcular THERON a mintear
        let theron_amount = hex_burned / holder.conversion_ratio;
        assert!(theron_amount > 0, 2); // E_ZERO_AMOUNT

        // Verificar max supply
        if (holder.max_supply > 0) {
            assert!(stats.total_minted + theron_amount <= holder.max_supply, 3);
        };

        let coin = coin::mint(&mut holder.treasury_cap, theron_amount, ctx);
        transfer::public_transfer(coin, recipient);

        stats.total_minted = stats.total_minted + theron_amount;
        stats.hex_burned_for_conversion = stats.hex_burned_for_conversion + hex_burned;

        sui::event::emit(HexConverted {
            player: recipient,
            hex_burned,
            theron_minted: theron_amount,
        });
    }

    /// Quemar THERON (para compras de Lands/Chests)
    public entry fun burn_for_purchase(
        holder: &mut TreasuryCapHolder,
        stats: &mut TheronStats,
        coin: Coin<THERON_TOKEN>,
        item_type: vector<u8>, // "land" o "chest"
        ctx: &TxContext
    ) {
        let amount = coin::value(&coin);
        coin::burn(&mut holder.treasury_cap, coin);

        stats.total_burned = stats.total_burned + amount;

        // Actualizar contador específico
        if (item_type == b"land") {
            stats.lands_purchased = stats.lands_purchased + 1;
        } else if (item_type == b"chest") {
            stats.chests_purchased = stats.chests_purchased + 1;
        };

        sui::event::emit(PurchaseMade {
            player: tx_context::sender(ctx),
            item_type,
            amount_spent: amount,
        });
    }

    /// Quemar por otras razones
    public entry fun burn_tokens(
        holder: &mut TreasuryCapHolder,
        stats: &mut TheronStats,
        coin: Coin<THERON_TOKEN>,
        reason: vector<u8>,
        ctx: &TxContext
    ) {
        let amount = coin::value(&coin);
        coin::burn(&mut holder.treasury_cap, coin);

        stats.total_burned = stats.total_burned + amount;

        sui::event::emit(TheronBurned {
            player: tx_context::sender(ctx),
            amount,
            reason,
        });
    }

    /// Split coin
    public entry fun split_coin(
        coin: &mut Coin<THERON_TOKEN>,
        amount: u64,
        ctx: &mut TxContext
    ) {
        let split = coin::split(coin, amount, ctx);
        transfer::public_transfer(split, tx_context::sender(ctx));
    }

    /// Merge coins
    public entry fun merge_coins(
        coin: &mut Coin<THERON_TOKEN>,
        other: Coin<THERON_TOKEN>,
    ) {
        coin::join(coin, other);
    }

    // === Getters ===
    
    public fun get_conversion_ratio(holder: &TreasuryCapHolder): u64 {
        holder.conversion_ratio
    }

    public fun get_max_supply(holder: &TreasuryCapHolder): u64 {
        holder.max_supply
    }

    public fun get_total_minted(stats: &TheronStats): u64 {
        stats.total_minted
    }

    public fun get_total_burned(stats: &TheronStats): u64 {
        stats.total_burned
    }

    public fun get_circulating_supply(stats: &TheronStats): u64 {
        stats.total_minted - stats.total_burned
    }

    public fun get_hex_burned_for_conversion(stats: &TheronStats): u64 {
        stats.hex_burned_for_conversion
    }
}
