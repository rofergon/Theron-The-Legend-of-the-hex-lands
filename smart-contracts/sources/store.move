/// Store - Marketplace para comprar Lands y Chests con THERON tokens
module theron_game::store {
    use sui::object::{Self, UID, ID};
    use sui::tx_context::{Self, TxContext};
    use sui::transfer;
    use sui::coin::{Self, Coin};
    use sui::balance::{Self, Balance};
    use sui::table::{Self, Table};
    use sui::event;
    use theron_game::theron_token::{THERON_TOKEN};
    use theron_game::land_nft::{Self, Land, LandMintCap, LandRegistry};

    /// Tipos de Chest
    const CHEST_COPPER: u8 = 0;
    const CHEST_SILVER: u8 = 1;
    const CHEST_GOLD: u8 = 2;

    /// Configuración de precios del Store
    public struct StoreConfig has key {
        id: UID,
        admin: address,
        /// Precios de Lands por rareza (en THERON tokens, con 9 decimales)
        land_prices: Table<u8, u64>,
        /// Precios de Chests
        chest_prices: Table<u8, u64>,
        /// Porcentaje que se quema (100 = 1%, 1000 = 10%)
        burn_percentage: u64,
        /// Balance acumulado (treasury del juego)
        treasury: Balance<THERON_TOKEN>,
        /// Estadísticas
        total_sales: u64,
        total_burned: u64,
    }

    /// NFT de Chest comprado (contiene items iniciales)
    public struct StarterChest has key, store {
        id: UID,
        chest_type: u8,
        initial_villagers: u8,
        initial_food: u64,
        initial_wood: u64,
        initial_stone: u64,
        production_multiplier: u64, // 100 = 1.0x
        is_opened: bool,
    }

    /// Eventos
    public struct LandPurchased has copy, drop {
        buyer: address,
        land_id: u64,
        rarity: u8,
        price_paid: u64,
        amount_burned: u64,
    }

    public struct ChestPurchased has copy, drop {
        buyer: address,
        chest_type: u8,
        price_paid: u64,
        amount_burned: u64,
    }

    public struct ChestOpened has copy, drop {
        owner: address,
        chest_type: u8,
    }

    /// Inicialización
    fun init(ctx: &mut TxContext) {
        let mut config = StoreConfig {
            id: object::new(ctx),
            admin: tx_context::sender(ctx),
            land_prices: table::new(ctx),
            chest_prices: table::new(ctx),
            burn_percentage: 3000, // 30% burn por defecto
            treasury: balance::zero(),
            total_sales: 0,
            total_burned: 0,
        };

        // Precios por defecto (en THERON con 9 decimales)
        // 1 THERON = 1_000_000_000
        table::add(&mut config.land_prices, 0, 10_000_000_000);  // Common: 10 THERON
        table::add(&mut config.land_prices, 1, 50_000_000_000);  // Rare: 50 THERON
        table::add(&mut config.land_prices, 2, 150_000_000_000); // Epic: 150 THERON
        table::add(&mut config.land_prices, 3, 500_000_000_000); // Legendary: 500 THERON

        // Precios de Chests
        table::add(&mut config.chest_prices, CHEST_COPPER, 5_000_000_000);  // 5 THERON
        table::add(&mut config.chest_prices, CHEST_SILVER, 15_000_000_000); // 15 THERON
        table::add(&mut config.chest_prices, CHEST_GOLD, 40_000_000_000);   // 40 THERON

        transfer::share_object(config);
    }

    /// Actualizar admin
    public entry fun update_admin(
        config: &mut StoreConfig,
        new_admin: address,
        ctx: &TxContext
    ) {
        assert!(tx_context::sender(ctx) == config.admin, 1); // E_NOT_ADMIN
        config.admin = new_admin;
    }

    /// Configurar precio de Land
    public entry fun set_land_price(
        config: &mut StoreConfig,
        rarity: u8,
        price: u64,
        ctx: &TxContext
    ) {
        assert!(tx_context::sender(ctx) == config.admin, 1);
        if (table::contains(&config.land_prices, rarity)) {
            *table::borrow_mut(&mut config.land_prices, rarity) = price;
        } else {
            table::add(&mut config.land_prices, rarity, price);
        };
    }

    /// Configurar precio de Chest
    public entry fun set_chest_price(
        config: &mut StoreConfig,
        chest_type: u8,
        price: u64,
        ctx: &TxContext
    ) {
        assert!(tx_context::sender(ctx) == config.admin, 1);
        if (table::contains(&config.chest_prices, chest_type)) {
            *table::borrow_mut(&mut config.chest_prices, chest_type) = price;
        } else {
            table::add(&mut config.chest_prices, chest_type, price);
        };
    }

    /// Configurar porcentaje de burn
    public entry fun set_burn_percentage(
        config: &mut StoreConfig,
        percentage: u64, // En basis points (100 = 1%)
        ctx: &TxContext
    ) {
        assert!(tx_context::sender(ctx) == config.admin, 1);
        assert!(percentage <= 10000, 2); // Máximo 100%
        config.burn_percentage = percentage;
    }

    /// Comprar un Land
    public entry fun buy_land(
        config: &mut StoreConfig,
        mint_cap: &mut LandMintCap,
        registry: &mut LandRegistry,
        payment: Coin<THERON_TOKEN>,
        rarity: u8,
        biome_type: u8,
        ctx: &mut TxContext
    ) {
        let buyer = tx_context::sender(ctx);
        
        // Verificar precio
        let price = *table::borrow(&config.land_prices, rarity);
        let paid = coin::value(&payment);
        assert!(paid >= price, 3); // E_INSUFFICIENT_PAYMENT

        // Calcular burn y treasury
        let to_burn = (price * config.burn_percentage) / 10000;
        let to_treasury = price - to_burn;

        // Procesar pago
        let mut payment_balance = coin::into_balance(payment);
        let burn_balance = balance::split(&mut payment_balance, to_burn);
        let treasury_balance = balance::split(&mut payment_balance, to_treasury);
        
        // Burn (enviar a dirección 0x0 o destruir)
        balance::join(&mut config.treasury, treasury_balance);
        
        // Actualizar stats
        config.total_sales = config.total_sales + price;
        config.total_burned = config.total_burned + to_burn;

        // Si pagó de más, devolver
        if (balance::value(&payment_balance) > 0) {
            let refund = coin::from_balance(payment_balance, ctx);
            transfer::public_transfer(refund, buyer);
        } else {
            balance::destroy_zero(payment_balance);
        };

        // Destruir balance de burn (equivalente a quemar)
        balance::destroy_zero(burn_balance);

        // Mintear el Land
        land_nft::mint_land_by_rarity(
            mint_cap,
            registry,
            rarity,
            biome_type,
            buyer,
            ctx
        );

        event::emit(LandPurchased {
            buyer,
            land_id: 0, // El ID real se obtiene del evento de mint
            rarity,
            price_paid: price,
            amount_burned: to_burn,
        });
    }

    /// Comprar un Starter Chest
    public entry fun buy_chest(
        config: &mut StoreConfig,
        payment: Coin<THERON_TOKEN>,
        chest_type: u8,
        ctx: &mut TxContext
    ) {
        let buyer = tx_context::sender(ctx);
        
        // Verificar precio
        let price = *table::borrow(&config.chest_prices, chest_type);
        let paid = coin::value(&payment);
        assert!(paid >= price, 3);

        // Calcular burn y treasury
        let to_burn = (price * config.burn_percentage) / 10000;
        let to_treasury = price - to_burn;

        let mut payment_balance = coin::into_balance(payment);
        let burn_balance = balance::split(&mut payment_balance, to_burn);
        let treasury_balance = balance::split(&mut payment_balance, to_treasury);
        
        balance::join(&mut config.treasury, treasury_balance);
        
        config.total_sales = config.total_sales + price;
        config.total_burned = config.total_burned + to_burn;

        if (balance::value(&payment_balance) > 0) {
            let refund = coin::from_balance(payment_balance, ctx);
            transfer::public_transfer(refund, buyer);
        } else {
            balance::destroy_zero(payment_balance);
        };

        balance::destroy_zero(burn_balance);

        // Crear el Chest NFT
        let (villagers, food, wood, stone, multiplier) = get_chest_contents(chest_type);
        
        let chest = StarterChest {
            id: object::new(ctx),
            chest_type,
            initial_villagers: villagers,
            initial_food: food,
            initial_wood: wood,
            initial_stone: stone,
            production_multiplier: multiplier,
            is_opened: false,
        };

        event::emit(ChestPurchased {
            buyer,
            chest_type,
            price_paid: price,
            amount_burned: to_burn,
        });

        transfer::transfer(chest, buyer);
    }

    /// Abrir un Chest (marca como abierto, el backend lee el contenido)
    public entry fun open_chest(
        chest: &mut StarterChest,
        ctx: &TxContext
    ) {
        assert!(!chest.is_opened, 4); // E_ALREADY_OPENED
        chest.is_opened = true;

        event::emit(ChestOpened {
            owner: tx_context::sender(ctx),
            chest_type: chest.chest_type,
        });
    }

    /// Helper: contenido de cada tipo de chest
    fun get_chest_contents(chest_type: u8): (u8, u64, u64, u64, u64) {
        if (chest_type == CHEST_COPPER) {
            // Copper: 4 villagers, recursos bajos, sin bonus
            (4, 100, 50, 30, 100)
        } else if (chest_type == CHEST_SILVER) {
            // Silver: 6 villagers, recursos medios, +10% producción
            (6, 150, 100, 50, 110)
        } else {
            // Gold: 8 villagers, recursos altos, +25% producción
            (8, 200, 150, 80, 125)
        }
    }

    /// Retirar fondos del treasury (solo admin)
    public entry fun withdraw_treasury(
        config: &mut StoreConfig,
        amount: u64,
        ctx: &mut TxContext
    ) {
        assert!(tx_context::sender(ctx) == config.admin, 1);
        let withdrawn = balance::split(&mut config.treasury, amount);
        let coin = coin::from_balance(withdrawn, ctx);
        transfer::public_transfer(coin, config.admin);
    }

    // === Getters ===

    public fun get_land_price(config: &StoreConfig, rarity: u8): u64 {
        *table::borrow(&config.land_prices, rarity)
    }

    public fun get_chest_price(config: &StoreConfig, chest_type: u8): u64 {
        *table::borrow(&config.chest_prices, chest_type)
    }

    public fun get_treasury_balance(config: &StoreConfig): u64 {
        balance::value(&config.treasury)
    }

    public fun get_total_sales(config: &StoreConfig): u64 {
        config.total_sales
    }

    public fun get_total_burned(config: &StoreConfig): u64 {
        config.total_burned
    }

    public fun is_chest_opened(chest: &StarterChest): bool {
        chest.is_opened
    }

    public fun get_chest_villagers(chest: &StarterChest): u8 {
        chest.initial_villagers
    }

    public fun get_chest_resources(chest: &StarterChest): (u64, u64, u64) {
        (chest.initial_food, chest.initial_wood, chest.initial_stone)
    }

    public fun get_chest_multiplier(chest: &StarterChest): u64 {
        chest.production_multiplier
    }
}
