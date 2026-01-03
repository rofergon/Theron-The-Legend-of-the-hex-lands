/// Land NFTs - Tierras hexagonales con biomas y bonificadores
/// Cada Land es un NFT único con metadata de bioma y rareza
module theron_game::land_nft {
    use sui::object::{Self, UID, ID};
    use sui::tx_context::{Self, TxContext};
    use sui::transfer;
    use std::string::{Self, String};
    use sui::event;
    use sui::table::{Self, Table};

    /// Tipos de bioma
    const BIOME_DESERT: u8 = 0;
    const BIOME_FOREST: u8 = 1;
    const BIOME_MOUNTAIN: u8 = 2;
    const BIOME_COAST: u8 = 3;
    const BIOME_VOLCANIC: u8 = 4;
    const BIOME_MYSTICAL: u8 = 5;

    /// Rarezas
    const RARITY_COMMON: u8 = 0;
    const RARITY_RARE: u8 = 1;
    const RARITY_EPIC: u8 = 2;
    const RARITY_LEGENDARY: u8 = 3;

    /// NFT de Land
    public struct Land has key, store {
        id: UID,
        /// ID numérico único
        land_id: u64,
        /// Tipo de bioma (0-5)
        biome_type: u8,
        /// Rareza (0-3)
        rarity: u8,
        /// Nombre del Land
        name: String,
        /// Descripción
        description: String,
        /// Modificador de Faith (100 = 1.0x, 150 = 1.5x)
        faith_multiplier: u64,
        /// Modificador de fertilidad
        fertility_multiplier: u64,
        /// Modificador de recursos de piedra
        stone_multiplier: u64,
        /// Modificador de recursos especiales
        special_resource_multiplier: u64,
        /// URL de imagen
        image_url: String,
    }

    /// Capacidad de minteo de Lands (controlled by game)
    public struct LandMintCap has key {
        id: UID,
        authorized_minter: address,
        next_land_id: u64,
        /// Registro de lands por tipo y rareza para control de distribución
        land_count_by_rarity: Table<u8, u64>,
    }

    /// Registry de todos los Lands minteados
    public struct LandRegistry has key {
        id: UID,
        total_lands: u64,
        lands_by_owner: Table<address, vector<ID>>,
    }

    /// Eventos
    public struct LandMinted has copy, drop {
        land_id: u64,
        owner: address,
        biome_type: u8,
        rarity: u8,
        faith_multiplier: u64,
    }

    public struct LandTransferred has copy, drop {
        land_id: u64,
        from: address,
        to: address,
    }

    /// Inicialización
    fun init(ctx: &mut TxContext) {
        let mut mint_cap = LandMintCap {
            id: object::new(ctx),
            authorized_minter: tx_context::sender(ctx),
            next_land_id: 1,
            land_count_by_rarity: table::new(ctx),
        };
        
        // Inicializar contadores
        table::add(&mut mint_cap.land_count_by_rarity, RARITY_COMMON, 0);
        table::add(&mut mint_cap.land_count_by_rarity, RARITY_RARE, 0);
        table::add(&mut mint_cap.land_count_by_rarity, RARITY_EPIC, 0);
        table::add(&mut mint_cap.land_count_by_rarity, RARITY_LEGENDARY, 0);

        transfer::share_object(mint_cap);

        let registry = LandRegistry {
            id: object::new(ctx),
            total_lands: 0,
            lands_by_owner: table::new(ctx),
        };
        transfer::share_object(registry);
    }

    /// Actualizar minter autorizado
    public entry fun update_authorized_minter(
        mint_cap: &mut LandMintCap,
        new_minter: address,
        ctx: &TxContext
    ) {
        assert!(tx_context::sender(ctx) == mint_cap.authorized_minter, 1); // E_NOT_AUTHORIZED
        mint_cap.authorized_minter = new_minter;
    }

    /// Mintear un nuevo Land (solo backend autorizado)
    public entry fun mint_land(
        mint_cap: &mut LandMintCap,
        registry: &mut LandRegistry,
        biome_type: u8,
        rarity: u8,
        name: vector<u8>,
        description: vector<u8>,
        faith_multiplier: u64,
        fertility_multiplier: u64,
        stone_multiplier: u64,
        special_resource_multiplier: u64,
        image_url: vector<u8>,
        recipient: address,
        ctx: &mut TxContext
    ) {
        assert!(tx_context::sender(ctx) == mint_cap.authorized_minter, 1);
        assert!(biome_type <= BIOME_MYSTICAL, 2); // E_INVALID_BIOME
        assert!(rarity <= RARITY_LEGENDARY, 3); // E_INVALID_RARITY

        let land_id = mint_cap.next_land_id;
        mint_cap.next_land_id = land_id + 1;

        let land = Land {
            id: object::new(ctx),
            land_id,
            biome_type,
            rarity,
            name: string::utf8(name),
            description: string::utf8(description),
            faith_multiplier,
            fertility_multiplier,
            stone_multiplier,
            special_resource_multiplier,
            image_url: string::utf8(image_url),
        };

        // Actualizar contador de rareza
        let count = table::borrow_mut(&mut mint_cap.land_count_by_rarity, rarity);
        *count = *count + 1;

        // Actualizar registry
        registry.total_lands = registry.total_lands + 1;

        event::emit(LandMinted {
            land_id,
            owner: recipient,
            biome_type,
            rarity,
            faith_multiplier,
        });

        transfer::public_transfer(land, recipient);
    }

    /// Mintear Land pre-configurado por rareza (facilita backend)
    public entry fun mint_land_by_rarity(
        mint_cap: &mut LandMintCap,
        registry: &mut LandRegistry,
        rarity: u8,
        biome_type: u8,
        recipient: address,
        ctx: &mut TxContext
    ) {
        assert!(tx_context::sender(ctx) == mint_cap.authorized_minter, 1);
        
        // Configuración predeterminada por rareza
        let (faith_mult, fert_mult, stone_mult, special_mult) = get_multipliers_for_rarity(rarity);
        
        let (name, description, image) = get_default_metadata(biome_type, rarity);

        mint_land(
            mint_cap,
            registry,
            biome_type,
            rarity,
            name,
            description,
            faith_mult,
            fert_mult,
            stone_mult,
            special_mult,
            image,
            recipient,
            ctx
        );
    }

    /// Helper: multiplicadores según rareza
    fun get_multipliers_for_rarity(rarity: u8): (u64, u64, u64, u64) {
        if (rarity == RARITY_COMMON) {
            (100, 100, 100, 100) // 1.0x todo
        } else if (rarity == RARITY_RARE) {
            (120, 110, 110, 120) // +20% Faith, +10% básicos, +20% especiales
        } else if (rarity == RARITY_EPIC) {
            (150, 125, 125, 150) // +50% Faith, +25% básicos, +50% especiales
        } else {
            (200, 150, 150, 200) // Legendary: +100% Faith, +50% básicos, +100% especiales
        }
    }

    /// Helper: metadata por defecto
    fun get_default_metadata(biome_type: u8, rarity: u8): (vector<u8>, vector<u8>, vector<u8>) {
        let biome_name = if (biome_type == BIOME_DESERT) {
            b"Desert Land"
        } else if (biome_type == BIOME_FOREST) {
            b"Forest Land"
        } else if (biome_type == BIOME_MOUNTAIN) {
            b"Mountain Land"
        } else if (biome_type == BIOME_COAST) {
            b"Coastal Land"
        } else if (biome_type == BIOME_VOLCANIC) {
            b"Volcanic Land"
        } else {
            b"Mystical Land"
        };

        let rarity_str = if (rarity == RARITY_COMMON) {
            b" (Common)"
        } else if (rarity == RARITY_RARE) {
            b" (Rare)"
        } else if (rarity == RARITY_EPIC) {
            b" (Epic)"
        } else {
            b" (Legendary)"
        };

        let description = b"A hexagonal land in the world of Theron with unique biome characteristics and resource bonuses.";
        let image = b"https://assets.theron.game/lands/placeholder.png";

        (biome_name, description, image)
    }

    /// Transfer de Land (wrapper para emitir evento)
    public entry fun transfer_land(
        land: Land,
        recipient: address,
        ctx: &TxContext
    ) {
        event::emit(LandTransferred {
            land_id: land.land_id,
            from: tx_context::sender(ctx),
            to: recipient,
        });

        transfer::public_transfer(land, recipient);
    }

    // === Getters públicos ===

    public fun get_land_id(land: &Land): u64 {
        land.land_id
    }

    public fun get_biome_type(land: &Land): u8 {
        land.biome_type
    }

    public fun get_rarity(land: &Land): u8 {
        land.rarity
    }

    public fun get_faith_multiplier(land: &Land): u64 {
        land.faith_multiplier
    }

    public fun get_fertility_multiplier(land: &Land): u64 {
        land.fertility_multiplier
    }

    public fun get_stone_multiplier(land: &Land): u64 {
        land.stone_multiplier
    }

    public fun get_special_resource_multiplier(land: &Land): u64 {
        land.special_resource_multiplier
    }

    public fun get_name(land: &Land): String {
        land.name
    }

    public fun get_description(land: &Land): String {
        land.description
    }

    public fun get_image_url(land: &Land): String {
        land.image_url
    }

    public fun get_total_lands(registry: &LandRegistry): u64 {
        registry.total_lands
    }

    public fun get_land_count_by_rarity(mint_cap: &LandMintCap, rarity: u8): u64 {
        *table::borrow(&mint_cap.land_count_by_rarity, rarity)
    }
}
