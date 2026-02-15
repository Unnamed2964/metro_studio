/**
 * MinHeap data structure for Dijkstra's algorithm.
 */
export class MinHeap {
  constructor() {
    this.items = []
  }

  push(node) {
    this.items.push(node)
    this.bubbleUp(this.items.length - 1)
  }

  pop() {
    if (!this.items.length) return null
    if (this.items.length === 1) return this.items.pop()
    const top = this.items[0]
    this.items[0] = this.items.pop()
    this.bubbleDown(0)
    return top
  }

  bubbleUp(index) {
    let current = index
    while (current > 0) {
      const parent = Math.floor((current - 1) / 2)
      if (this.items[parent].dist <= this.items[current].dist) break
      const temp = this.items[parent]
      this.items[parent] = this.items[current]
      this.items[current] = temp
      current = parent
    }
  }

  bubbleDown(index) {
    let current = index
    const length = this.items.length
    while (true) {
      const left = current * 2 + 1
      const right = left + 1
      let smallest = current
      if (left < length && this.items[left].dist < this.items[smallest].dist) {
        smallest = left
      }
      if (right < length && this.items[right].dist < this.items[smallest].dist) {
        smallest = right
      }
      if (smallest === current) break
      const temp = this.items[current]
      this.items[current] = this.items[smallest]
      this.items[smallest] = temp
      current = smallest
    }
  }
}
