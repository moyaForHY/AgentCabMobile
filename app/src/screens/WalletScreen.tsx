import React, { useEffect, useState, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  FlatList,
  Linking,
  RefreshControl,
} from 'react-native'
import { colors, spacing, fontSize } from '../utils/theme'
import { useI18n } from '../i18n'
import { fetchWallet, fetchTransactions, createZPayOrder, checkZPayOrder } from '../services/api'

const RECHARGE_AMOUNTS = [10, 30, 50, 100]

export default function WalletScreen() {
  const { t } = useI18n()
  const [wallet, setWallet] = useState<any>(null)
  const [transactions, setTransactions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [recharging, setRecharging] = useState(false)
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null)
  const [paymentType] = useState<'wxpay' | 'alipay'>('alipay')

  const load = useCallback(async () => {
    try {
      const [w, t] = await Promise.all([fetchWallet(), fetchTransactions(1, 20)])
      setWallet(w)
      setTransactions(t.items)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const onRefresh = async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  const handleRecharge = async (amount: number) => {
    setRecharging(true)
    try {
      const order = await createZPayOrder(amount, paymentType)
      // Try to open Alipay app directly via scheme, fallback to browser
      const alipayScheme = order.payurl
        ? `alipays://platformapi/startapp?saId=10000007&qrcode=${encodeURIComponent(order.payurl)}`
        : null

      let opened = false
      if (alipayScheme) {
        try {
          const canOpen = await Linking.canOpenURL(alipayScheme)
          if (canOpen) {
            await Linking.openURL(alipayScheme)
            opened = true
          }
        } catch {}
      }

      // Fallback: open in browser
      if (!opened && order.payurl) {
        try {
          await Linking.openURL(order.payurl)
          opened = true
        } catch {}
      }

      // Show confirmation dialog after opening payment
      if (opened) {
        Alert.alert(
          t.paymentTitle,
          t.paymentConfirm,
          [
            {
              text: t.ivePaid,
              onPress: async () => {
                try {
                  await checkZPayOrder(order.out_trade_no)
                  await load()
                  Alert.alert(t.successTitle, t.paymentSuccess)
                } catch {
                  Alert.alert(t.pendingTitle, t.paymentPending)
                }
              },
            },
            { text: t.cancel, style: 'cancel' },
          ],
        )
      }
    } catch (err: any) {
      Alert.alert(t.errorTitle, err.message || t.failed)
    } finally {
      setRecharging(false)
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>{t.creditsBalance}</Text>
        <Text style={styles.balanceAmount}>
          {wallet?.credits != null ? Number(wallet.credits).toLocaleString() : '--'}
        </Text>
      </View>

      <Text style={styles.sectionTitle}>{t.rechargeViaAlipay}</Text>

      <View style={styles.amountGrid}>
        {RECHARGE_AMOUNTS.map(amount => (
          <TouchableOpacity
            key={amount}
            style={[styles.amountCard, selectedAmount === amount && styles.amountCardSelected]}
            onPress={() => setSelectedAmount(amount)}>
            <Text style={[styles.amountValue, selectedAmount === amount && styles.amountValueSelected]}>
              ¥{amount}
            </Text>
            <Text style={[styles.amountCredits, selectedAmount === amount && styles.amountCreditsSelected]}>
              {amount * 100} {t.credits}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity
        style={[styles.rechargeButton, (!selectedAmount || recharging) && styles.rechargeButtonDisabled]}
        onPress={() => selectedAmount && handleRecharge(selectedAmount)}
        disabled={!selectedAmount || recharging}>
        {recharging ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.rechargeButtonText}>
            {selectedAmount ? `${t.payAmount}${selectedAmount}` : t.selectAmount}
          </Text>
        )}
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>{t.recentTransactions}</Text>
      {transactions.length === 0 ? (
        <Text style={styles.emptyText}>{t.noTransactions}</Text>
      ) : (
        transactions.map(tx => (
          <View key={tx.id} style={styles.txRow}>
            <View style={styles.txLeft}>
              <Text style={styles.txType}>{(t as any)[`tx${tx.type.charAt(0).toUpperCase()}${tx.type.slice(1)}`] || tx.type}</Text>
              <Text style={styles.txDate}>
                {new Date(tx.created_at).toLocaleDateString('zh-CN')}
              </Text>
            </View>
            <Text style={[styles.txAmount, Number(tx.credits) > 0 ? styles.txPositive : styles.txNegative]}>
              {Number(tx.credits) > 0 ? '+' : ''}{tx.credits}
            </Text>
          </View>
        ))
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  balanceCard: {
    backgroundColor: colors.primary,
    borderRadius: 16,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  balanceLabel: {
    fontSize: fontSize.sm,
    color: 'rgba(255,255,255,0.8)',
  },
  balanceAmount: {
    fontSize: 40,
    fontWeight: '700',
    color: '#fff',
    marginTop: spacing.xs,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.md,
    marginTop: spacing.sm,
  },
  paymentToggle: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 3,
    marginBottom: spacing.md,
  },
  payToggle: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderRadius: 8,
  },
  payToggleActive: {
    backgroundColor: colors.primary,
  },
  payToggleText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  payToggleTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  amountGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  amountCard: {
    width: '48%',
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  amountCardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '10',
  },
  amountValue: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.text,
  },
  amountValueSelected: {
    color: colors.primary,
  },
  amountCredits: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  amountCreditsSelected: {
    color: colors.primary,
  },
  rechargeButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    padding: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  rechargeButtonDisabled: {
    opacity: 0.5,
  },
  rechargeButtonText: {
    color: '#fff',
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  emptyText: {
    fontSize: fontSize.md,
    color: colors.textMuted,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
  txRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: 10,
    marginBottom: spacing.sm,
  },
  txLeft: {
    flex: 1,
  },
  txType: {
    fontSize: fontSize.sm,
    fontWeight: '500',
    color: colors.text,
    textTransform: 'capitalize',
  },
  txDate: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  txAmount: {
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  txPositive: {
    color: colors.success,
  },
  txNegative: {
    color: colors.error,
  },
})
