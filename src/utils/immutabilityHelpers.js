'use strict';

import clone from 'lodash/clone'
import { isObjectOrArray } from  './typeUtils'

/**
 * Immutability helpers
 *
 * inspiration:
 *
 * https://www.npmjs.com/package/seamless-immutable
 * https://www.npmjs.com/package/ih
 * https://www.npmjs.com/package/mutatis
 */


/**
 * helper function to get a nested property in an object or array
 *
 * @param {Object | Array} object
 * @param {Path} path
 * @return {* | undefined} Returns the field when found, or undefined when the
 *                         path doesn't exist
 */
export function getIn (object, path) {
  let value = object
  let i = 0

  while(i < path.length) {
    if (isObjectOrArray(value)) {
      value = value[path[i]]
    }
    else {
      value = undefined
    }

    i++
  }

  return value
}

/**
 * helper function to replace a nested property in an object with a new value
 * without mutating the object itself.
 *
 * @param {Object | Array} object
 * @param {Path} path
 * @param {*} value
 * @return {Object | Array} Returns a new, updated object or array
 */
export function setIn (object, path, value) {
  if (path.length === 0) {
    return value
  }

  if (!isObjectOrArray(object)) {
    throw new Error('Path does not exist')
  }

  const key = path[0]
  const updatedValue = setIn(object[key], path.slice(1), value)
  if (object[key] === updatedValue) {
    // return original object unchanged when the new value is identical to the old one
    return object
  }
  else {
    const updatedObject = clone(object)
    updatedObject[key] = updatedValue
    return updatedObject
  }
}
/**
 * helper function to replace a nested property in an object with a new value
 * without mutating the object itself.
 *
 * @param {Object | Array} object
 * @param {Path} path
 * @param {function} callback
 * @return {Object | Array} Returns a new, updated object or array
 */
export function updateIn (object, path, callback) {
  if (path.length === 0) {
    return callback(object)
  }

  if (!isObjectOrArray(object)) {
    throw new Error('Path doesn\'t exist')
  }

  const key = path[0]
  const updatedValue = updateIn(object[key], path.slice(1), callback)
  if (object[key] === updatedValue) {
    // return original object unchanged when the new value is identical to the old one
    return object
  }
  else {
    const updatedObject = clone(object)
    updatedObject[key] = updatedValue
    return updatedObject
  }
}

/**
 * helper function to delete a nested property in an object
 * without mutating the object itself.
 *
 * @param {Object | Array} object
 * @param {Path} path
 * @return {Object | Array} Returns a new, updated object or array
 */
export function deleteIn (object, path) {
  if (path.length === 0) {
    return object
  }

  if (!isObjectOrArray(object)) {
    return object
  }

  if (path.length === 1) {
    const key = path[0]
    if (object[key] === undefined) {
      // key doesn't exist. return object unchanged
      return object
    }
    else {
      const updatedObject = clone(object)

      if (Array.isArray(updatedObject)) {
        updatedObject.splice(key, 1)
      }
      else {
        delete updatedObject[key]
      }

      return updatedObject
    }
  }

  const key = path[0]
  const updatedValue = deleteIn(object[key], path.slice(1))
  if (object[key] === updatedValue) {
    // object is unchanged
    return object
  }
  else {
    const updatedObject = clone(object)
    updatedObject[key] = updatedValue
    return updatedObject
  }
}