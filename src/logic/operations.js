import { cloneDeepWith, first, initial, isEmpty, last, pickBy } from 'lodash-es'
import { getIn } from '../utils/immutabilityHelpers.js'
import { compileJSONPointer } from '../utils/jsonPointer.js'
import { findUniqueName } from '../utils/stringUtils.js'
import { isObject, isObjectOrArray } from '../utils/typeUtils.js'
import { getKeys, getNextKeys } from './documentState.js'
import {
  createSelection,
  createSelectionFromOperations,
  getParentPath
} from './selection.js'

/**
 * Create a JSONPatch for an insert operation.
 *
 * This function needs the current data in order to be able to determine
 * a unique property name for the inserted node in case of duplicating
 * and object property
 *
 * @param {JSON} doc
 * @param {JSON} state
 * @param {Path} path
 * @param {Array.<{key?: string, value: JSON}>} values
 * @return {JSONPatchDocument}
 */
// TODO: write tests
export function insertBefore (doc, state, path, values) { // TODO: find a better name and define datastructure for values
  const parentPath = initial(path)
  const parent = getIn(doc, parentPath)

  if (Array.isArray(parent)) {
    const offset = parseInt(last(path), 10)
    return values.map((entry, index) => ({
      op: 'add',
      path: compileJSONPointer(parentPath.concat(offset + index)),
      value: entry.value
    }))
  } else { // 'object'
    const afterKey = last(path)
    const keys = getKeys(state, parentPath)
    const nextKeys = getNextKeys(keys, afterKey, true)

    return [
      // insert new values
      ...values.map(entry => {
        const newProp = findUniqueName(entry.key, parent)
        return {
          op: 'add',
          path: compileJSONPointer(parentPath.concat(newProp)),
          value: entry.value
        }
      }),

      // move all lower down keys so the inserted key will maintain it's position
      ...nextKeys.map(key => moveDown(parentPath, key))
    ]
  }
}

/**
 * Create a JSONPatch for an append operation. The values will be appended
 * to the end of the array or object.
 *
 * This function needs the current data in order to be able to determine
 * a unique property name for the inserted node in case of duplicating
 * and object property
 *
 * @param {JSON} json
 * @param {Path} path
 * @param {Array.<{key?: string, value: JSON}>} values
 * @return {JSONPatchDocument}
 */
export function append (json, path, values) { // TODO: find a better name and define datastructure for values
  const parent = getIn(json, path)

  if (Array.isArray(parent)) {
    const offset = parent.length
    return values.map((entry, index) => ({
      op: 'add',
      path: compileJSONPointer(path.concat(offset + index)),
      value: entry.value
    }))
  } else { // 'object'
    return values.map(entry => {
      const newProp = findUniqueName(entry.key, parent)
      return {
        op: 'add',
        path: compileJSONPointer(path.concat(newProp)),
        value: entry.value
      }
    })
  }
}

/**
 * Rename an object key
 * Not applicable to arrays
 *
 * @param {Path} parentPath
 * @param {string[]} keys
 * @param {string} oldKey
 * @param {string} newKey
 * @returns {JSONPatchDocument}
 */
export function rename (parentPath, keys, oldKey, newKey) {
  const nextKeys = getNextKeys(keys, oldKey, false)

  return [
    // rename a key
    {
      op: 'move',
      from: compileJSONPointer(parentPath.concat(oldKey)),
      path: compileJSONPointer(parentPath.concat(newKey))
    },

    // move all lower down keys so the renamed key will maintain it's position
    ...nextKeys.map(key => moveDown(parentPath, key))
  ]
}

/**
 * Create a JSONPatch for an insert operation.
 *
 * This function needs the current data in order to be able to determine
 * a unique property name for the inserted node in case of duplicating
 * and object property
 *
 * @param {JSON} doc
 * @param {JSON} state
 * @param {Path[]} paths
 * @param {Array.<{key?: string, value: JSON}>} values
 * @return {JSONPatchDocument}
 */
export function replace (doc, state, paths, values) { // TODO: find a better name and define datastructure for values
  const firstPath = first(paths)
  const parentPath = initial(firstPath)
  const parent = getIn(doc, parentPath)

  if (Array.isArray(parent)) {
    const firstPath = first(paths)
    const offset = firstPath ? parseInt(last(firstPath), 10) : 0

    return [
      // remove operations
      ...removeAll(paths),

      // insert operations
      ...values.map((entry, index) => ({
        op: 'add',
        path: compileJSONPointer(parentPath.concat(index + offset)),
        value: entry.value
      }))
    ]
  } else { // parent is Object
    // if we're going to replace an existing object with key "a" with a new
    // key "a", we must not create a new unique name "a (copy)".
    const lastPath = last(paths)
    const parentPath = initial(lastPath)
    const beforeKey = last(lastPath)
    const keys = getKeys(state, parentPath)
    const nextKeys = getNextKeys(keys, beforeKey, false)
    const removeKeys = new Set(paths.map(path => last(path)))
    const parentWithoutRemovedKeys = pickBy(parent, (value, key) => !removeKeys.has(key))

    return [
      // remove operations
      ...removeAll(paths),

      // insert operations
      ...values.map(entry => {
        const newProp = findUniqueName(entry.key, parentWithoutRemovedKeys)
        return {
          op: 'add',
          path: compileJSONPointer(parentPath.concat(newProp)),
          value: entry.value
        }
      }),

      // move down operations
      // move all lower down keys so the renamed key will maintain it's position
      ...nextKeys.map(key => moveDown(parentPath, key))
    ]
  }
}

/**
 * Create a JSONPatch for a duplicate action.
 *
 * This function needs the current data in order to be able to determine
 * a unique property name for the duplicated node in case of duplicating
 * and object property
 *
 * @param {JSON} doc
 * @param {JSON} state
 * @param {Path[]} paths
 * @return {JSONPatchDocument}
 */
export function duplicate (doc, state, paths) {
  // FIXME: here we assume selection.paths is sorted correctly, that's a dangerous assumption
  const lastPath = last(paths)
  const parentPath = initial(lastPath)
  const beforeKey = last(lastPath)
  const parent = getIn(doc, parentPath)

  if (Array.isArray(parent)) {
    const lastPath = last(paths)
    const offset = lastPath ? (parseInt(last(lastPath), 10) + 1) : 0

    return [
      // copy operations
      ...paths.map((path, index) => ({
        op: 'copy',
        from: compileJSONPointer(path),
        path: compileJSONPointer(parentPath.concat(index + offset))
      }))
    ]
  } else { // 'object'
    const keys = getKeys(state, parentPath)
    const nextKeys = getNextKeys(keys, beforeKey, false)

    return [
      // copy operations
      ...paths.map(path => {
        const prop = last(path)
        const newProp = findUniqueName(prop, parent)

        return {
          op: 'copy',
          from: compileJSONPointer(path),
          path: compileJSONPointer(parentPath.concat(newProp))
        }
      }),

      // move down operations
      // move all lower down keys so the renamed key will maintain it's position
      ...nextKeys.map(key => moveDown(parentPath, key))
    ]
  }
}

export function insert (doc, state, selection, values) {
  if (selection.beforePath) {
    return insertBefore(doc, state, selection.beforePath, values)
  } else if (selection.appendPath) {
    return append(doc, selection.appendPath, values)
  } else if (selection.paths) {
    return replace(doc, state, selection.paths, values)
  } else {
    // TODO: implement support for inserting in value or keyPath and valuePath?
    throw new Error('Cannot insert: unsupported type of selection')
  }
}

export function createNewValue (doc, selection, type) {
  switch (type) {
    case 'value':
      return ''

    case 'object':
      return {}

    case 'array':
      return []

    case 'structure': {
      const parentPath = getParentPath(selection)
      const parent = getIn(doc, parentPath)

      if (Array.isArray(parent) && !isEmpty(parent)) {
        const jsonExample = first(parent)
        return cloneDeepWith(jsonExample, (value) => {
          return Array.isArray(value)
            ? []
            : isObject(value)
              ? undefined // leave object as is, will recurse into it
              : ''
        })
      } else {
        // no example structure
        return ''
      }
    }

    default:
      return ''
  }
}

/**
 * Create a JSONPatch for a remove operation
 * @param {Path} path
 * @return {JSONPatchDocument}
 */
export function remove (path) {
  return [{
    op: 'remove',
    path: compileJSONPointer(path)
  }]
}

/**
 * Create a JSONPatch for a multiple remove operation
 * @param {Path[]} paths
 * @return {JSONPatchDocument}
 */
export function removeAll (paths) {
  return paths
    .map(path => ({
      op: 'remove',
      path: compileJSONPointer(path)
    }))
    .reverse() // reverse is needed for arrays: delete the last index first
}

// helper function to move a key down in an object,
// so another key can get positioned before the moved down keys
function moveDown (parentPath, key) {
  return {
    op: 'move',
    from: compileJSONPointer(parentPath.concat(key)),
    path: compileJSONPointer(parentPath.concat(key))
  }
}

/**
 * @param {JSON} doc
 * @param {JSON} state
 * @param {Selection} selection
 * @param {string} clipboardData
 * @return {{
 *   operations: JSONPatchDocument,
 *   newSelection: Selection
 * }}
 */
// TODO: write unit tests
export function createPasteOperations (doc, state, selection, clipboardData) {
  const clipboard = parsePartialJson(clipboardData)

  if (selection.valuePath) {
    // replace selected value
    const operations = [
      {
        op: 'replace',
        path: compileJSONPointer(selection.valuePath),
        value: clipboard
      }
    ]

    return { operations, newSelection: selection }
  } else if (selection.keyPath) {
    if (isObjectOrArray(clipboard)) {
      // replace current entry, not just the key
      const values = clipboardToValues(clipboard)
      const operations = insert(doc, state, selection, values)
      const newSelection = createSelectionFromOperations(operations)

      return { operations, newSelection }
    } else {
      // rename key
      const path = initial(selection.keyPath)
      const oldKey = last(selection.keyPath)
      const keys = getKeys(state, path)
      const nextKeys = getNextKeys(keys, oldKey, false)
      const newKey = String(clipboard)
      const newKeyUnique = findUniqueName(newKey, getIn(doc, path))
      const operations = rename(path, oldKey, newKeyUnique, nextKeys)
      const newSelection = createSelection(doc, state, { keyPath: path.concat(newKeyUnique) })

      return { operations, newSelection }
    }
  } else {
    const values = clipboardToValues(clipboard)
    console.log('values', { values, clipboard }) // FIXME: cleanup
    const operations = insert(doc, state, selection, values)
    const newSelection = createSelectionFromOperations(operations)

    return { operations, newSelection }
  }
}

/**
 * @param {JSON} clipboard
 * @returns {Array.<{key: string, value: *}>}
 */
function clipboardToValues (clipboard) {
  if (Array.isArray(clipboard)) {
    return clipboard.map((value, index) => {
      return { key: 'New item ' + index, value }
    })
  } else if (isObject(clipboard)) {
    return Object.keys(clipboard).map(key => {
      return { key, value: clipboard[key] }
    })
  } else {
    // regular value
    return [
      { key: 'New Item', value: clipboard }
    ]
  }
}

/**
 * @param {string} partialJson
 * @return {JSON}
 */
export function parsePartialJson (partialJson) {
  // TODO: this should be processed and fixed by simple-json-repair
  // for now: dumb brute force approach: simply try out a few things...

  // remove trailing comma
  if (partialJson.endsWith(',')) {
    partialJson = partialJson.substring(0, partialJson.length - 1)
  }

  try {
    return JSON.parse(partialJson)
  } catch (err) {}

  try {
    return JSON.parse('[' + partialJson + ']')
  } catch (err) {}

  try {
    return JSON.parse('{' + partialJson + '}')
  } catch (err) {}

  throw new Error('Failed to parse partial JSON')
}