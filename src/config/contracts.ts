/**
 * OneChain Deployed Contracts Configuration
 * 
 * IDs de los contratos desplegados en OneChain Testnet
 * Actualizado: 2025-11-25 - Includes mint_from_faith_public function
 */

/**
 * Package ID principal - identifica todos los contratos desplegados
 */
export const ONECHAIN_PACKAGE_ID = "0x1485f42c238eec453bf21abdaf3fe57475f3269a1becb570d9f6d0b368be44a4";

/**
 * HEX Token (Token Débil - Inflacionario)
 * Generado desde Faith, usado para construcciones y upgrades in-game
 */
export const HEX_TOKEN = {
  // Objeto que contiene el TreasuryCap para mintear/quemar
  TREASURY_HOLDER: "0x5a39aaa300943133d2fc9e37d3886974df3e4ad0aac07032aae0f65dbb3e3357",
  
  // Objeto con estadísticas de la economía (total minted, burned, faith converted)
  ECONOMY_STATS: "0x9f3a36446b3ce1ddf06042da7e7668620d43f5c4f4bc71566217d74358617fe9",
  
  // Metadata del token (público)
  METADATA: "0x47bcd82d72269b17a4554df0f1f18f713178fa348d8f4b7b18675c4036613634",
  
  // Nombre del módulo en el package
  MODULE: "hex_token",
  
  // Tipo completo del token para transacciones
  TYPE: `${ONECHAIN_PACKAGE_ID}::hex_token::HEX_TOKEN`,
} as const;

/**
 * THERON Token (Token Fuerte - Limitado)
 * Se obtiene quemando 100k HEX, usado para comprar Lands y Chests
 */
export const THERON_TOKEN = {
  TREASURY_HOLDER: "0xdbfee58c179faa8c182a472754eb38a66ea4f735193fabbd98f3d46a83e5a8bb",
  STATS: "0x83d81b4225b444f7a475ce8cc59608db3f1f97b94c9310f651f1a99bb59d065f",
  METADATA: "0x26b67098c8cfacc4c88d65cce42470fb21195fdc22a24481ed413bd6b7439906",
  MODULE: "theron_token",
  TYPE: `${ONECHAIN_PACKAGE_ID}::theron_token::THERON_TOKEN`,
} as const;

/**
 * Land NFT
 * NFTs de tierras con diferentes rarezas y multiplicadores
 */
export const LAND_NFT = {
  MINT_CAP: "0x489ec027e16019c8bb6ea8834cba5ce0ecb4ecac7c7632b856f3fef7b2190bb6",
  REGISTRY: "0x880b0d03db1f47a9656f474eb10e50e3e96a258b04879752a0f3f8ab361bb56e",
  MODULE: "land_nft",
} as const;

/**
 * Store (Marketplace)
 * Compra de Lands y Chests con THERON
 */
export const STORE = {
  CONFIG: "0x5e2e5a12b24115bcbed65a5cf3f572ee2bbf2efe46b6a07efc80541c771b0cec",
  MODULE: "store",
} as const;

/**
 * Upgrade Cap
 * Permite actualizar los contratos en el futuro
 */
export const UPGRADE_CAP = "0x9161db78cf8dd9627b9af6b4a7b6d8422d73a046b524e3cd5df7001fed6c228b";

/**
 * Conversion rates
 */
export const CONVERSION_RATES = {
  // Faith a HEX: 20 Faith = 1 HEX
  FAITH_TO_HEX: 20,
  
  // HEX a THERON: 100,000 HEX = 1 THERON
  HEX_TO_THERON: 100_000,
} as const;

/**
 * Network configuration
 */
export const NETWORK = "testnet" as const;

export const NETWORK_CONFIG = {
  RPC_URL: "https://rpc-testnet.onelabs.cc:443",
  EXPLORER_URL: "https://onescan.cc/testnet",
  // OneChain usa el mismo formato de chain ID que Sui
  // Pero puede que OneWallet necesite "onechain:testnet" o solo "testnet"
  CHAIN_ID: "testnet", // Intentar sin prefijo primero
  CHAIN_ID_ALT: "sui:testnet", // Alternativa para compatibilidad
  CHAIN_ID_ONECHAIN: "onechain:testnet", // Formato OneChain específico
} as const;
