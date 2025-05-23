class Queue<T> {
    private data: T[] = []

    moveToStart(item: T): void {
        this.data = [item, ...this.data.filter(it => it !== item)]
    }

    find(callback: (item: T) => boolean): T | undefined {
        for (const item of this.data) {
            if (callback(item)) {
                return item
            }
        }
    }

    enqueue(element: T): void {
        this.data.push(element)
    }

    dequeue(): T | undefined {
        return this.data.shift()
    }

    peek(): T | undefined {
        return this.data[0]
    }

    isEmpty(): boolean {
        return this.data.length === 0
    }

    size(): number {
        return this.data.length
    }
}

export {
    Queue,
}