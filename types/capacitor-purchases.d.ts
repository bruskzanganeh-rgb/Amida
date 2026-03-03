// Type stubs for @capawesome-team/capacitor-purchases
// Install the actual package when Apple Developer account is configured:
// npm install @capawesome-team/capacitor-purchases

declare module '@capawesome-team/capacitor-purchases' {
  interface PurchaseOptions {
    productId: string
  }

  interface PurchaseResult {
    transactionId: string
    productId: string
  }

  export const Purchases: {
    purchase(options: PurchaseOptions): Promise<PurchaseResult>
    getProducts(options: { productIds: string[] }): Promise<{ products: unknown[] }>
    restorePurchases(): Promise<void>
  }
}
