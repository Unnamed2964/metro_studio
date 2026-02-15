import { createId } from '../../../lib/ids'
import {
  createTransferPairKey,
  hasManualTransferBetween,
} from '../../../lib/transfer'

export const transferActions = {
  hasManualTransferBetweenStations(stationAId, stationBId) {
    if (!this.project) return false
    return hasManualTransferBetween(this.project.manualTransfers, stationAId, stationBId)
  },

  addManualTransferBetweenStations(stationAId, stationBId) {
    if (!this.project) return false
    const stationIdSet = new Set((this.project.stations || []).map((station) => station.id))
    const idA = String(stationAId || '')
    const idB = String(stationBId || '')
    const pairKey = createTransferPairKey(idA, idB)
    if (!pairKey) return false
    if (!stationIdSet.has(idA) || !stationIdSet.has(idB)) return false
    const [normalizedA, normalizedB] = pairKey.split('__')
    const alreadyExists = hasManualTransferBetween(this.project.manualTransfers, normalizedA, normalizedB)
    if (alreadyExists) return false
    if (!Array.isArray(this.project.manualTransfers)) {
      this.project.manualTransfers = []
    }
    this.project.manualTransfers.push({
      id: createId('transfer'),
      stationAId: normalizedA,
      stationBId: normalizedB,
    })
    this.recomputeStationLineMembership()
    this.touchProject('已添加手动换乘关系')
    return true
  },

  removeManualTransferBetweenStations(stationAId, stationBId) {
    if (!this.project || !Array.isArray(this.project.manualTransfers)) return false
    const pairKey = createTransferPairKey(stationAId, stationBId)
    if (!pairKey) return false
    const prevLength = this.project.manualTransfers.length
    this.project.manualTransfers = this.project.manualTransfers.filter(
      (transfer) => createTransferPairKey(transfer?.stationAId, transfer?.stationBId) !== pairKey,
    )
    if (this.project.manualTransfers.length === prevLength) return false
    this.recomputeStationLineMembership()
    this.touchProject('已移除手动换乘关系')
    return true
  },

  addManualTransferForSelectedStations() {
    if (!this.project) return false
    if ((this.selectedStationIds || []).length !== 2) return false
    const [stationAId, stationBId] = this.selectedStationIds
    const changed = this.addManualTransferBetweenStations(stationAId, stationBId)
    if (!changed) {
      this.statusText = '所选两站已存在换乘关系或不可添加'
      return false
    }
    this.statusText = '已将所选两站设为换乘'
    return true
  },

  removeManualTransferForSelectedStations() {
    if (!this.project) return false
    if ((this.selectedStationIds || []).length !== 2) return false
    const [stationAId, stationBId] = this.selectedStationIds
    const changed = this.removeManualTransferBetweenStations(stationAId, stationBId)
    if (!changed) {
      this.statusText = '所选两站未建立换乘关系'
      return false
    }
    this.statusText = '已取消所选两站换乘'
    return true
  },
}
