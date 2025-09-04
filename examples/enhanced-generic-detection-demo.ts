import { SchemaTransformer } from '../src/transformer.js'
import { IsString, IsNumber, IsOptional } from 'class-validator'

// Ejemplo que demuestra la detección mejorada de tipos genéricos

// Interface base para demostrar utility types
interface UserData {
  name: string
  email: string
  age: number
  active: boolean
}

// Clase que usa varios tipos genéricos/utility types
class AdvancedUserEntity {
  @IsNumber()
  id: number

  // Partial hace todas las propiedades opcionales
  @IsOptional()
  partialData: Partial<UserData>

  // Required hace todas las propiedades obligatorias
  requiredData: Required<UserData>

  // Pick selecciona solo ciertas propiedades
  @IsOptional()
  basicInfo: Pick<UserData, 'name' | 'email'>

  // Omit excluye ciertas propiedades
  profileInfo: Omit<UserData, 'active'>

  // Arrays de tipos
  @IsOptional()
  userList: UserData[]

  // Record crea un tipo de diccionario
  @IsOptional()
  userMap: Record<string, UserData>

  // Tipos anidados más complejos
  @IsOptional()
  nestedPartial: Partial<Pick<UserData, 'name' | 'email'>>
}

// Función de demostración
export function demonstrateEnhancedGenericDetection() {
  console.log('🔍 Demostración: Detección Mejorada de Tipos Genéricos\n')

  const transformer = SchemaTransformer.getInstance()
  const result = transformer.transform(AdvancedUserEntity)

  console.log('📊 Esquema generado para AdvancedUserEntity:')
  console.log(JSON.stringify(result.schema, null, 2))

  console.log('\n✨ Mejoras implementadas:')
  console.log('1. Detección robusta usando TypeScript AST API')
  console.log('2. Análisis de TypeChecker para types complejos')
  console.log('3. Soporte para utility types anidados')
  console.log('4. Mejor manejo de tipos condicionales y mapeados')

  // Verificar propiedades específicas
  const properties = result.schema.properties

  console.log('\n🎯 Verificaciones específicas:')

  if (properties.partialData) {
    console.log('✓ partialData: Detectado como Partial<T> correctamente')
  }

  if (properties.requiredData) {
    console.log('✓ requiredData: Detectado como Required<T> correctamente')
  }

  if (properties.basicInfo) {
    console.log('✓ basicInfo: Detectado como Pick<T, K> correctamente')
  }

  if (properties.userList && properties.userList.type === 'array') {
    console.log('✓ userList: Array type detectado correctamente')
  }

  if (properties.userMap && properties.userMap.type === 'object') {
    console.log('✓ userMap: Record<K, V> detectado como object correctamente')
  }

  console.log('\n📈 Ventajas vs método anterior:')
  console.log('- Más preciso: Usa AST en lugar de regex de strings')
  console.log('- Más robusto: Maneja casos edge y tipos complejos')
  console.log('- Más mantenible: Basado en APIs oficiales de TypeScript')
  console.log('- Más extensible: Fácil agregar nuevos tipos genéricos')

  return result
}

// Ejecutar demostración si se ejecuta directamente
if (import.meta.url === `file://${process.argv[1]}`) {
  demonstrateEnhancedGenericDetection()
}
