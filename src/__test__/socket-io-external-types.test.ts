import { test, describe } from 'node:test'
import assert from 'node:assert'
import { transform } from '../transformer.js'
import { Server } from 'socket.io'

/**
 * Test class that uses Server from socket.io as an external type
 * This tests the real-world scenario of resolving types from npm packages
 */
class ServerSocketInstance {
  server: Server // Socket.IO server instance
  createdAt: Date
}

describe('Socket.IO External Types Resolution Tests', () => {
  test('should handle Server type from socket.io package', () => {
    const result = transform(ServerSocketInstance)

    assert.strictEqual(result.name, 'ServerSocketInstance')
    assert.strictEqual(result.schema.type, 'object')

    // Check that basic properties are resolved correctly
    assert.ok(result.schema.properties.createdAt)
    assert.strictEqual(result.schema.properties.createdAt.type, 'string')
    assert.strictEqual(result.schema.properties.createdAt.format, 'date-time')

    // Check that external type (Server) is handled
    assert.ok(result.schema.properties.server)
    assert.strictEqual(result.schema.properties.server.type, 'object')

    // All properties should be required (no optional operator used)
    assert.ok(result.schema.required.includes('server'))
    assert.ok(result.schema.required.includes('createdAt'))
  })

  test('should extract properties from Server type when possible', () => {
    const result = transform(ServerSocketInstance)

    const serverProp = result.schema.properties.server
    assert.strictEqual(serverProp.type, 'object')

    // Should extract properties from the external Socket.IO Server type
    assert.ok(serverProp.properties, 'Server should have properties extracted')
    assert.ok(
      Object.keys(serverProp.properties).length > 0,
      'Should have at least one property'
    )

    // Validate specific Socket.IO Server properties
    const expectedProps = ['sockets', 'engine', 'httpServer']
    const foundProps = expectedProps.filter(prop => serverProp.properties[prop])

    assert.ok(
      foundProps.length >= 3,
      `Should find all expected Socket.IO Server properties: ${expectedProps.join(', ')}`
    )

    // Validate property types
    assert.strictEqual(serverProp.properties.engine.type, 'object')
    assert.strictEqual(serverProp.properties.sockets.type, 'object')
    assert.strictEqual(serverProp.properties.httpServer.type, 'object')
  })

  test('should not crash when external Server type cannot be fully resolved', () => {
    assert.doesNotThrow(() => {
      const result = transform(ServerSocketInstance)
      assert.strictEqual(result.schema.type, 'object')
      assert.ok(result.schema.properties.server)
    })
  })

  test('should provide meaningful fallback for unresolvable external types', () => {
    const result = transform(ServerSocketInstance)

    assert.ok(result.schema.properties.server)
    assert.strictEqual(result.schema.properties.server.type, 'object')
    assert.ok(Array.isArray(result.schema.required))
  })
})
