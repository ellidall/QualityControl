class Stack<T> {
    private storage: T[] = []

    constructor(
        private capacity: number = Infinity,
    ) {
    }

    push(item: T): void {
        if (this.size() === this.capacity) {
            throw new Error("Stack has reached its maximum capacity")
        }
        this.storage.push(item)
    }

    pop(): T | undefined {
        return this.storage.pop()
    }

    peek(): T | undefined {
        return this.storage[this.size() - 1]
    }

    size(): number {
        return this.storage.length
    }

    isEmpty(): boolean {
        return this.storage.length === 0
    }

    toArray(): T[] {
        return [...this.storage];
    }
}

export {
    Stack,
}
