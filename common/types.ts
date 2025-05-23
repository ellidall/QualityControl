// src/interfaces/IOrderItem.ts
export interface IOrderItem {
    id: string;
    name: string;
    price: number;
    quantity: number;
}

export interface IInventoryService {
    checkStock(itemId: string, quantity: number): Promise<boolean>;
    reduceStock(itemId: string, quantity: number): Promise<void>;
}

export interface IPaymentGateway {
    charge(amount: number, customerEmail: string, orderId: string): Promise<boolean>;
}

export interface INotificationService {
    sendOrderConfirmation(customerEmail: string, orderDetails: any): Promise<void>;
    sendPaymentFailedNotification(customerEmail: string, orderId: string): Promise<void>;
}