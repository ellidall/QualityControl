import {IOrderItem, IInventoryService, IPaymentGateway, INotificationService} from '@common/types'
import {v4 as uuidV4} from 'uuid'

export class OrderProcessor {
    public items: IOrderItem[] = []
    public customerEmail: string
    public discountApplied: boolean = false
    public paymentStatus: 'pending' | 'paid' | 'failed' = 'pending'
    private readonly orderId: string

    constructor(
        customerEmail: string,
        private inventoryService: IInventoryService,
        private paymentGateway: IPaymentGateway,
        private notificationService: INotificationService,
    ) {
        if (!customerEmail || !customerEmail.includes('@')) {
            throw new Error('Некорректный email покупателя.')
        }
        this.customerEmail = customerEmail
        this.orderId = uuidV4()
    }

    getOrderId(): string {
        return this.orderId
    }

    addItem(item: IOrderItem): void {
        if (item.quantity <= 0 || item.price < 0) {
            console.warn(`Попытка добавить товар ${item.name} с некорректным количеством или ценой.`)
            return
        }
        const existingItem = this.items.find(i => i.id === item.id)
        if (existingItem) {
            existingItem.quantity += item.quantity
        } else {
            this.items.push(item)
        }
    }

    removeItem(itemId: string): void {
        const itemIndex = this.items.findIndex(i => i.id === itemId)
        if (itemIndex > -1) {
            this.items.splice(itemIndex, 1)
        } else {
            console.warn(`Товар с ID ${itemId} не найден в заказе.`)
        }
    }

    calculateTotal(): number {
        let total = this.items.reduce((sum, item) => sum + item.price * item.quantity, 0)
        if (this.discountApplied) {
            total *= 0.9
        }
        return parseFloat(total.toFixed(2))
    }

    applyDiscount(discountCode: string): boolean {
        if (discountCode === 'SALE10' && !this.discountApplied) {
            this.discountApplied = true
            return true
        }
        return false
    }

    async processOrder(): Promise<boolean> {
        if (this.items.length === 0) {
            console.error('Заказ пуст. Невозможно обработать.')
            return false
        }

        for (const item of this.items) {
            const isInStock = await this.inventoryService.checkStock(item.id, item.quantity)
            if (!isInStock) {
                console.error(`Товар ${item.name} (ID: ${item.id}) отсутствует на складе в нужном количестве.`)
                this.paymentStatus = 'failed'
                await this.notificationService.sendPaymentFailedNotification(
                    this.customerEmail,
                    `Товар ${item.name} отсутствует`,
                )
                return false
            }
        }

        const totalAmount = this.calculateTotal()
        if (totalAmount <= 0 && this.items.length > 0) {
            console.warn('Общая сумма заказа равна 0, но товары есть. Пропускаем оплату.')
            this.paymentStatus = 'paid'
        } else if (totalAmount > 0) {
            const paymentSuccessful = await this.paymentGateway.charge(totalAmount, this.customerEmail, this.orderId)
            if (!paymentSuccessful) {
                this.paymentStatus = 'failed'
                console.error(`Оплата заказа ${this.orderId} не удалась.`)
                await this.notificationService.sendPaymentFailedNotification(this.customerEmail, this.orderId)
                return false
            }
            this.paymentStatus = 'paid'
        }


        if (this.paymentStatus === 'paid') {
            try {
                for (const item of this.items) {
                    await this.inventoryService.reduceStock(item.id, item.quantity)
                }
            } catch (error) {
                console.error(`Критическая ошибка: не удалось уменьшить остатки для заказа ${this.orderId} после оплаты.`, error)
            }
        }


        await this.notificationService.sendOrderConfirmation(this.customerEmail, {
            orderId: this.orderId,
            items: this.items,
            totalAmount,
            status: this.paymentStatus,
        })

        return true
    }

    getOrderStatus(): string {
        const total = this.calculateTotal()
        return `Заказ ID: ${this.orderId}, Email: ${this.customerEmail}, Товаров: ${this.items.length}, Сумма: ${total.toFixed(2)}, Скидка: ${this.discountApplied ? 'Да' : 'Нет'}, Статус оплаты: ${this.paymentStatus}.`
    }
}