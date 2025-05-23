import { OrderProcessor } from '../src/OrderProcessor';
import { IOrderItem, IInventoryService, IPaymentGateway, INotificationService } from '../common/types';

// Моки для зависимостей
const mockInventoryService: jest.Mocked<IInventoryService> = {
    checkStock: jest.fn(),
    reduceStock: jest.fn(),
};

const mockPaymentGateway: jest.Mocked<IPaymentGateway> = {
    charge: jest.fn(),
};

const mockNotificationService: jest.Mocked<INotificationService> = {
    sendOrderConfirmation: jest.fn(),
    sendPaymentFailedNotification: jest.fn(),
};

// Вспомогательная функция для создания тестовых товаров
const createTestItem = (id: string, price: number, quantity: number): IOrderItem => ({
    id,
    name: `Test Item ${id}`,
    price,
    quantity,
});

describe('OrderProcessor', () => {
    let orderProcessor: OrderProcessor;
    const customerEmail = 'test@example.com';
    let consoleErrorSpy: jest.SpyInstance;
    let consoleWarnSpy: jest.SpyInstance;

    beforeEach(() => {
        jest.clearAllMocks();

        orderProcessor = new OrderProcessor(
            customerEmail,
            mockInventoryService,
            mockPaymentGateway,
            mockNotificationService
        );

        mockInventoryService.checkStock.mockResolvedValue(true);
        mockInventoryService.reduceStock.mockResolvedValue(undefined);
        mockPaymentGateway.charge.mockResolvedValue(true);
        mockNotificationService.sendOrderConfirmation.mockResolvedValue(undefined);
        mockNotificationService.sendPaymentFailedNotification.mockResolvedValue(undefined);

        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
        consoleErrorSpy.mockRestore();
        consoleWarnSpy.mockRestore();
    });

    test('должен корректно создаваться с email', () => {
        expect(orderProcessor).toBeInstanceOf(OrderProcessor);
        expect(orderProcessor.customerEmail).toBe(customerEmail);
        expect(orderProcessor.items).toEqual([]);
        expect(orderProcessor.discountApplied).toBe(false);
        expect(orderProcessor.paymentStatus).toBe('pending');
        expect(orderProcessor.getOrderId()).toBeDefined();
    });

    test('должен выбрасывать ошибку при некорректном email в конструкторе', () => {
        consoleErrorSpy.mockRestore();
        expect(() => new OrderProcessor('invalid-email', mockInventoryService, mockPaymentGateway, mockNotificationService))
            .toThrow('Некорректный email покупателя.');
    });

    describe('addItem', () => {
        test('должен добавлять новый товар в заказ', () => {
            const item1 = createTestItem('item1', 100, 1);
            orderProcessor.addItem(item1);
            expect(orderProcessor.items).toContainEqual(item1);
            expect(orderProcessor.items.length).toBe(1);
        });

        test('должен увеличивать количество, если товар уже есть в заказе', () => {
            const item1 = createTestItem('item1', 100, 1);
            orderProcessor.addItem(item1);
            orderProcessor.addItem({ ...item1, quantity: 2 });
            expect(orderProcessor.items.length).toBe(1);
            expect(orderProcessor.items[0].quantity).toBe(3);
        });

        test('не должен добавлять товар с количеством <= 0 и выводить предупреждение', () => {
            const itemInvalidQuantity = createTestItem('item-invalid', 100, 0);
            orderProcessor.addItem(itemInvalidQuantity);
            expect(orderProcessor.items).not.toContainEqual(itemInvalidQuantity);
            expect(orderProcessor.items.length).toBe(0);
            expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('некорректным количеством или ценой'));
        });

        test('не должен добавлять товар с отрицательной ценой и выводить предупреждение', () => {
            const itemInvalidPrice = createTestItem('item-invalid-price', -10, 1);
            orderProcessor.addItem(itemInvalidPrice);
            expect(orderProcessor.items).not.toContainEqual(itemInvalidPrice);
            expect(orderProcessor.items.length).toBe(0);
            expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('некорректным количеством или ценой'));
        });
    });

    describe('removeItem', () => {
        test('должен удалять товар из заказа', () => {
            const item1 = createTestItem('item1', 100, 1);
            const item2 = createTestItem('item2', 200, 1);
            orderProcessor.addItem(item1);
            orderProcessor.addItem(item2);
            orderProcessor.removeItem('item1');
            expect(orderProcessor.items).not.toContainEqual(item1);
            expect(orderProcessor.items).toContainEqual(item2);
            expect(orderProcessor.items.length).toBe(1);
        });

        test('не должен ничего делать и выводить предупреждение, если товара нет в заказе', () => {
            const item1 = createTestItem('item1', 100, 1);
            orderProcessor.addItem(item1);
            orderProcessor.removeItem('nonExistentItemId');
            expect(orderProcessor.items.length).toBe(1);
            expect(consoleWarnSpy).toHaveBeenCalledWith("Товар с ID nonExistentItemId не найден в заказе.");
        });
    });

    describe('calculateTotal', () => {
        test('должен возвращать 0 для пустого заказа', () => {
            expect(orderProcessor.calculateTotal()).toBe(0);
        });

        test('должен корректно считать сумму для одного товара', () => {
            orderProcessor.addItem(createTestItem('item1', 100, 2));
            expect(orderProcessor.calculateTotal()).toBe(200);
        });

        test('должен корректно считать сумму для нескольких товаров', () => {
            orderProcessor.addItem(createTestItem('item1', 100, 1));
            orderProcessor.addItem(createTestItem('item2', 50, 3));
            expect(orderProcessor.calculateTotal()).toBe(250);
        });

        test('должен применять скидку, если она активна', () => {
            orderProcessor.addItem(createTestItem('item1', 100, 1));
            orderProcessor.addItem(createTestItem('item2', 100, 1));
            orderProcessor.discountApplied = true;
            expect(orderProcessor.calculateTotal()).toBe(180);
        });

        test('должен корректно округлять сумму до двух знаков', () => {
            orderProcessor.addItem(createTestItem('item1', 33.333, 1));
            orderProcessor.addItem(createTestItem('item2', 66.666, 1));
            expect(orderProcessor.calculateTotal()).toBe(100.00);

            orderProcessor.items = [];
            orderProcessor.addItem(createTestItem('item3', 10.123, 1));
            expect(orderProcessor.calculateTotal()).toBe(10.12);
        });
    });

    describe('applyDiscount', () => {
        test('должен применять скидку для корректного кода', () => {
            const result = orderProcessor.applyDiscount('SALE10');
            expect(result).toBe(true);
            expect(orderProcessor.discountApplied).toBe(true);
        });

        test('не должен применять скидку для некорректного кода', () => {
            const result = orderProcessor.applyDiscount('INVALIDCODE');
            expect(result).toBe(false);
            expect(orderProcessor.discountApplied).toBe(false);
        });

        test('не должен применять скидку, если она уже применена', () => {
            orderProcessor.applyDiscount('SALE10');
            const result = orderProcessor.applyDiscount('SALE10');
            expect(result).toBe(false);
            expect(orderProcessor.discountApplied).toBe(true);
        });
    });

    describe('processOrder', () => {
        const item1 = createTestItem('prod1', 50, 2);
        const item2 = createTestItem('prod2', 75, 1);

        beforeEach(() => {
            orderProcessor.addItem(item1);
            orderProcessor.addItem(item2);
        });

        test('должен успешно обработать заказ', async () => {
            const result = await orderProcessor.processOrder();

            expect(result).toBe(true);
            expect(mockInventoryService.checkStock).toHaveBeenCalledTimes(2);
            expect(mockInventoryService.checkStock).toHaveBeenCalledWith(item1.id, item1.quantity);
            expect(mockInventoryService.checkStock).toHaveBeenCalledWith(item2.id, item2.quantity);

            const expectedTotal = (item1.price * item1.quantity) + (item2.price * item2.quantity);
            expect(mockPaymentGateway.charge).toHaveBeenCalledWith(expectedTotal, customerEmail, orderProcessor.getOrderId());

            expect(mockInventoryService.reduceStock).toHaveBeenCalledTimes(2);
            expect(mockInventoryService.reduceStock).toHaveBeenCalledWith(item1.id, item1.quantity);
            expect(mockInventoryService.reduceStock).toHaveBeenCalledWith(item2.id, item2.quantity);

            expect(mockNotificationService.sendOrderConfirmation).toHaveBeenCalledWith(
                customerEmail,
                expect.objectContaining({
                    orderId: orderProcessor.getOrderId(),
                    totalAmount: expectedTotal,
                    status: 'paid'
                })
            );
            expect(orderProcessor.paymentStatus).toBe('paid');
            expect(consoleErrorSpy).not.toHaveBeenCalled();
        });

        test('должен успешно обработать заказ со скидкой', async () => {
            orderProcessor.applyDiscount('SALE10');
            const result = await orderProcessor.processOrder();

            expect(result).toBe(true);
            const totalWithoutDiscount = (item1.price * item1.quantity) + (item2.price * item2.quantity);
            const expectedTotalWithDiscount = parseFloat((totalWithoutDiscount * 0.9).toFixed(2));

            expect(mockPaymentGateway.charge).toHaveBeenCalledWith(expectedTotalWithDiscount, customerEmail, orderProcessor.getOrderId());
            expect(mockNotificationService.sendOrderConfirmation).toHaveBeenCalledWith(
                customerEmail,
                expect.objectContaining({ totalAmount: expectedTotalWithDiscount, status: 'paid' })
            );
            expect(orderProcessor.paymentStatus).toBe('paid');
            expect(consoleErrorSpy).not.toHaveBeenCalled();
        });

        test('не должен обрабатывать пустой заказ и выводить ошибку', async () => {
            orderProcessor.items = [];
            const result = await orderProcessor.processOrder();
            expect(result).toBe(false);
            expect(mockInventoryService.checkStock).not.toHaveBeenCalled();
            expect(mockPaymentGateway.charge).not.toHaveBeenCalled();
            expect(consoleErrorSpy).toHaveBeenCalledWith('Заказ пуст. Невозможно обработать.');
        });

        test('должен завершиться неудачей, если товара нет на складе, и выводить ошибку', async () => {
            mockInventoryService.checkStock.mockResolvedValueOnce(true);
            mockInventoryService.checkStock.mockResolvedValueOnce(false);

            const result = await orderProcessor.processOrder();

            expect(result).toBe(false);
            expect(mockInventoryService.checkStock).toHaveBeenCalledTimes(2);
            expect(mockPaymentGateway.charge).not.toHaveBeenCalled();
            expect(mockInventoryService.reduceStock).not.toHaveBeenCalled();
            expect(mockNotificationService.sendOrderConfirmation).not.toHaveBeenCalled();
            expect(mockNotificationService.sendPaymentFailedNotification).toHaveBeenCalledWith(
                customerEmail,
                `Товар ${item2.name} отсутствует`
            );
            expect(orderProcessor.paymentStatus).toBe('failed');
            expect(consoleErrorSpy).toHaveBeenCalledWith(`Товар ${item2.name} (ID: ${item2.id}) отсутствует на складе в нужном количестве.`);
        });

        test('должен завершиться неудачей, если оплата не прошла, и выводить ошибку', async () => {
            mockPaymentGateway.charge.mockResolvedValue(false);

            const result = await orderProcessor.processOrder();

            expect(result).toBe(false);
            expect(mockInventoryService.checkStock).toHaveBeenCalledTimes(2);
            expect(mockPaymentGateway.charge).toHaveBeenCalled();
            expect(mockInventoryService.reduceStock).not.toHaveBeenCalled();
            expect(mockNotificationService.sendOrderConfirmation).not.toHaveBeenCalled();
            expect(mockNotificationService.sendPaymentFailedNotification).toHaveBeenCalledWith(customerEmail, orderProcessor.getOrderId());
            expect(orderProcessor.paymentStatus).toBe('failed');
            expect(consoleErrorSpy).toHaveBeenCalledWith(`Оплата заказа ${orderProcessor.getOrderId()} не удалась.`);
        });

        test('должен обработать заказ с нулевой стоимостью, пропуская оплату и выводя предупреждение', async () => {
            orderProcessor.items = [createTestItem('freeItem', 0, 1)];

            const result = await orderProcessor.processOrder();

            expect(result).toBe(true);
            expect(mockInventoryService.checkStock).toHaveBeenCalledWith('freeItem', 1);
            expect(mockPaymentGateway.charge).not.toHaveBeenCalled();
            expect(mockInventoryService.reduceStock).toHaveBeenCalledWith('freeItem', 1);
            expect(mockNotificationService.sendOrderConfirmation).toHaveBeenCalledWith(
                customerEmail,
                expect.objectContaining({ totalAmount: 0, status: 'paid' })
            );
            expect(orderProcessor.paymentStatus).toBe('paid');
            expect(consoleWarnSpy).toHaveBeenCalledWith('Общая сумма заказа равна 0, но товары есть. Пропускаем оплату.');
            expect(consoleErrorSpy).not.toHaveBeenCalled();
        });

        test('должен логировать критическую ошибку, если не удалось уменьшить остатки после оплаты', async () => {
            mockPaymentGateway.charge.mockResolvedValue(true);
            const dbError = new Error('Ошибка базы данных склада');
            mockInventoryService.reduceStock.mockRejectedValueOnce(dbError); // Ошибка на первом товаре

            const result = await orderProcessor.processOrder();

            expect(result).toBe(true);
            expect(orderProcessor.paymentStatus).toBe('paid');
            expect(mockInventoryService.reduceStock).toHaveBeenCalledTimes(1);
            expect(mockInventoryService.reduceStock).toHaveBeenCalledWith(item1.id, item1.quantity);

            expect(consoleErrorSpy).toHaveBeenCalledWith(
                expect.stringContaining(`Критическая ошибка: не удалось уменьшить остатки для заказа ${orderProcessor.getOrderId()} после оплаты.`),
                dbError
            );
            expect(mockNotificationService.sendOrderConfirmation).toHaveBeenCalled(); // Уведомление все равно отправляется
        });
    });

    describe('getOrderStatus', () => {
        test('должен возвращать корректный статус заказа', () => {
            orderProcessor.addItem(createTestItem('itemA', 10, 1));
            const status = orderProcessor.getOrderStatus();
            expect(status).toContain(`Заказ ID: ${orderProcessor.getOrderId()}`);
            expect(status).toContain(`Email: ${customerEmail}`);
            expect(status).toContain('Товаров: 1');
            expect(status).toContain('Сумма: 10.00');
            expect(status).toContain('Скидка: Нет');
            expect(status).toContain('Статус оплаты: pending');
        });

        test('должен отображать примененную скидку и статус paid', () => {
            orderProcessor.addItem(createTestItem('itemA', 100, 1));
            orderProcessor.applyDiscount('SALE10');
            orderProcessor.paymentStatus = 'paid';
            const status = orderProcessor.getOrderStatus();
            expect(status).toContain('Сумма: 90.00');
            expect(status).toContain('Скидка: Да');
            expect(status).toContain('Статус оплаты: paid');
        });
    });
});