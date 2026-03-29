/**
 * DynamicForm: Renders a form from a JSON Schema (skill input_schema).
 * Supports: string, number, integer, boolean, enum (select), file upload, array of files.
 */
import React, { useState, useCallback } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Switch,
  StyleSheet,
  ScrollView,
  Alert,
  Image,
} from 'react-native'
import { colors, spacing, fontSize } from '../utils/theme'
import { pickByFormat, pickPhoto, pickVideo, pickFile, type PickedFile } from '../services/deviceCapabilities'

type SchemaProperty = {
  type?: string
  title?: string
  description?: string
  default?: any
  enum?: any[]
  minimum?: number
  maximum?: number
  format?: string // 'file', 'image', 'uri'
  items?: SchemaProperty
}

type JsonSchema = {
  type?: string
  properties?: Record<string, SchemaProperty>
  required?: string[]
  title?: string
  description?: string
}

type Props = {
  schema: JsonSchema
  values: Record<string, any>
  onChange: (values: Record<string, any>) => void
  pickedFiles: Record<string, PickedFile[]>
  onFilePicked: (fieldKey: string, files: PickedFile[]) => void
}

export default function DynamicForm({ schema, values, onChange, pickedFiles, onFilePicked }: Props) {
  const properties = schema.properties || {}
  const required = new Set(schema.required || [])

  const setValue = useCallback(
    (key: string, value: any) => {
      onChange({ ...values, [key]: value })
    },
    [values, onChange],
  )

  return (
    <View style={styles.form}>
      {Object.entries(properties).map(([key, prop]) => (
        <FormField
          key={key}
          fieldKey={key}
          prop={prop}
          value={values[key]}
          isRequired={required.has(key)}
          onChange={v => setValue(key, v)}
          pickedFiles={pickedFiles[key] || []}
          onFilePicked={files => onFilePicked(key, files)}
        />
      ))}
    </View>
  )
}

function FormField({
  fieldKey,
  prop,
  value,
  isRequired,
  onChange,
  pickedFiles,
  onFilePicked,
}: {
  fieldKey: string
  prop: SchemaProperty
  value: any
  isRequired: boolean
  onChange: (v: any) => void
  pickedFiles: PickedFile[]
  onFilePicked: (files: PickedFile[]) => void
}) {
  const label = prop.title || fieldKey
  const hint = prop.description || ''
  const format = prop.format || ''
  const isFile = format === 'file' || format === 'image' || format === 'video' || format === 'audio' || format === 'document' || fieldKey === 'files' || fieldKey === 'file'
  const detectedFormat = format || (fieldKey.includes('image') || fieldKey.includes('photo') ? 'image' : fieldKey.includes('video') ? 'video' : 'file')

  // File picker — auto-detects type from schema format
  if (isFile) {
    const pickerButtons: { label: string; format: string }[] = []
    if (detectedFormat === 'image') {
      pickerButtons.push({ label: '📷 Photo', format: 'image' })
      pickerButtons.push({ label: '📁 File', format: 'file' })
    } else if (detectedFormat === 'video') {
      pickerButtons.push({ label: '🎬 Video', format: 'video' })
      pickerButtons.push({ label: '📁 File', format: 'file' })
    } else {
      pickerButtons.push({ label: '📁 File', format: 'file' })
    }

    return (
      <View style={styles.field}>
        <Text style={styles.label}>
          {label} {isRequired && <Text style={styles.required}>*</Text>}
        </Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}

        <View style={styles.fileRow}>
          {pickedFiles.map((f, i) => (
            <View key={i} style={styles.fileBadge}>
              {f.mimeType?.startsWith('image/') ? (
                <Image source={{ uri: f.uri }} style={styles.fileThumb} />
              ) : null}
              <Text style={styles.fileName} numberOfLines={1}>{f.name}</Text>
            </View>
          ))}
        </View>

        <View style={styles.fileButtons}>
          {pickerButtons.map(btn => (
            <TouchableOpacity
              key={btn.format}
              style={styles.pickButton}
              onPress={async () => {
                const file = await pickByFormat(btn.format)
                if (file) onFilePicked([...pickedFiles, file])
              }}>
              <Text style={styles.pickButtonText}>{btn.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    )
  }

  // Enum / select
  if (prop.enum && prop.enum.length > 0) {
    return (
      <View style={styles.field}>
        <Text style={styles.label}>
          {label} {isRequired && <Text style={styles.required}>*</Text>}
        </Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
        <View style={styles.enumRow}>
          {prop.enum.map(opt => (
            <TouchableOpacity
              key={String(opt)}
              style={[styles.enumOption, value === opt && styles.enumOptionSelected]}
              onPress={() => onChange(opt)}>
              <Text style={[styles.enumText, value === opt && styles.enumTextSelected]}>
                {String(opt)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    )
  }

  // Boolean
  if (prop.type === 'boolean') {
    return (
      <View style={styles.field}>
        <View style={styles.boolRow}>
          <Text style={styles.label}>
            {label} {isRequired && <Text style={styles.required}>*</Text>}
          </Text>
          <Switch
            value={!!value}
            onValueChange={onChange}
            trackColor={{ true: colors.primary, false: colors.border }}
          />
        </View>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
    )
  }

  // Number / integer
  if (prop.type === 'number' || prop.type === 'integer') {
    return (
      <View style={styles.field}>
        <Text style={styles.label}>
          {label} {isRequired && <Text style={styles.required}>*</Text>}
        </Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
        <TextInput
          style={styles.input}
          value={value != null ? String(value) : ''}
          onChangeText={t => {
            const num = prop.type === 'integer' ? parseInt(t, 10) : parseFloat(t)
            onChange(isNaN(num) ? undefined : num)
          }}
          keyboardType="numeric"
          placeholder={
            prop.default != null
              ? `Default: ${prop.default}`
              : prop.minimum != null
              ? `Min: ${prop.minimum}${prop.maximum != null ? `, Max: ${prop.maximum}` : ''}`
              : ''
          }
          placeholderTextColor={colors.textMuted}
        />
      </View>
    )
  }

  // String (default)
  const isMultiline = (prop.description || '').toLowerCase().includes('prompt') ||
    fieldKey.includes('prompt') || fieldKey.includes('description') || fieldKey.includes('text')

  return (
    <View style={styles.field}>
      <Text style={styles.label}>
        {label} {isRequired && <Text style={styles.required}>*</Text>}
      </Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      <TextInput
        style={[styles.input, isMultiline && styles.multilineInput]}
        value={value != null ? String(value) : ''}
        onChangeText={onChange}
        placeholder={prop.default != null ? `Default: ${prop.default}` : ''}
        placeholderTextColor={colors.textMuted}
        multiline={isMultiline}
        numberOfLines={isMultiline ? 4 : 1}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  form: {
    gap: spacing.md,
  },
  field: {
    marginBottom: spacing.sm,
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  required: {
    color: colors.error,
  },
  hint: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: colors.background,
    borderRadius: 10,
    padding: spacing.md,
    fontSize: fontSize.md,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  multilineInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  enumRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  enumOption: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 8,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  enumOptionSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  enumText: {
    fontSize: fontSize.sm,
    color: colors.text,
  },
  enumTextSelected: {
    color: '#fff',
    fontWeight: '600',
  },
  boolRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  fileRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  fileBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: 8,
    padding: spacing.xs,
    paddingRight: spacing.sm,
    gap: spacing.xs,
  },
  fileThumb: {
    width: 32,
    height: 32,
    borderRadius: 4,
  },
  fileName: {
    fontSize: fontSize.xs,
    color: colors.text,
    maxWidth: 100,
  },
  fileButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  pickButton: {
    backgroundColor: colors.primaryLight + '30',
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  pickButtonText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.primary,
  },
})
