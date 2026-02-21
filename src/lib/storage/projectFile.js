import { normalizeProject, PROJECT_SCHEMA_VERSION } from '../projectModel'
import JSZip from 'jszip'

const FILE_EXTENSION = '.metro-studio.json'

/** @param {string} projectName @returns {string} */
export function buildProjectFileName(projectName) {
  const safeName = (projectName || 'metro-studio-project').replace(/[<>:"/\\|?*]+/g, '_').trim()
  return `${safeName || 'metro-studio-project'}${FILE_EXTENSION}`
}

/** @param {import('../projectModel').RailProject} project @returns {string} */
export function serializeProject(project) {
  const normalized = normalizeProject(project)
  return JSON.stringify(
    {
      ...normalized,
      projectVersion: normalized.projectVersion || PROJECT_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
    },
    null,
    2,
  )
}

/** @param {import('../projectModel').RailProject} project @returns {void} */
export function downloadProjectFile(project) {
  const payload = serializeProject(project)
  const blob = new Blob([payload], { type: 'application/json' })
  downloadBlob(blob, buildProjectFileName(project.name))
}

/** @param {import('../projectModel').RailProject[]} [projects=[]] @param {string} [zipName='metro-studio-projects.zip'] @returns {Promise<void>} */
export async function downloadProjectsZip(projects = [], zipName = 'metro-studio-projects.zip') {
  const list = Array.isArray(projects) ? projects.filter(Boolean) : []
  if (!list.length) {
    throw new Error('没有可导出的工程')
  }

  const zip = new JSZip()
  const usedNames = new Set()

  for (const project of list) {
    const payload = serializeProject(project)
    const baseName = buildProjectFileName(project?.name)
    let fileName = baseName
    let suffix = 2
    while (usedNames.has(fileName)) {
      fileName = baseName.replace(FILE_EXTENSION, ` (${suffix})${FILE_EXTENSION}`)
      suffix += 1
    }
    usedNames.add(fileName)
    zip.file(fileName, payload)
  }

  const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } })
  downloadBlob(zipBlob, zipName)
}

/** @param {File} file @returns {Promise<import('../projectModel').RailProject>} */
export async function parseProjectFile(file) {
  const text = await file.text()
  const raw = JSON.parse(text)
  if (!raw || typeof raw !== 'object') {
    throw new Error('工程文件格式不正确')
  }
  if (!raw.projectVersion) {
    throw new Error('工程文件缺少 projectVersion')
  }
  return normalizeProject(raw)
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}
