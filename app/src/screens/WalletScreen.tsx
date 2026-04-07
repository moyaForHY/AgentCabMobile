import React, { useEffect, useState, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  Linking,
  RefreshControl,
} from 'react-native'
import { colors, spacing, fontSize, fontWeight, shadows } from '../utils/theme'
import { useI18n } from '../i18n'
import { showModal } from '../components/AppModal'
import { fetchWallet, fetchTransactions, createZPayOrder, checkZPayOrder } from '../services/api'
import { storage } from '../services/storage'
import Icon from 'react-native-vector-icons/Feather'
import { SkeletonBox } from '../components/Skeleton'
import LinearGradient from 'react-native-linear-gradient'

const RECHARGE_AMOUNTS = [10, 30, 50, 100]

export default function WalletScreen() {
  const { t, lang } = useI18n()
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
      // Save to cache
      storage.setStringAsync('wallet_data', JSON.stringify(w)).catch(() => {})
      storage.setStringAsync('wallet_transactions', JSON.stringify(t.items)).catch(() => {})
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // 1. Load from cache first
    ;(async () => {
      try {
        const [cachedWallet, cachedTx] = await Promise.all([
          storage.getStringAsync('wallet_data'),
          storage.getStringAsync('wallet_transactions'),
        ])
        if (cachedWallet) setWallet(JSON.parse(cachedWallet))
        if (cachedTx) setTransactions(JSON.parse(cachedTx))
        if (cachedWallet) setLoading(false)
      } catch {}

      // 2. Then fetch fresh data
      await load()
    })()
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
        showModal(
          t.paymentTitle,
          t.paymentConfirm,
          [
            {
              text: t.ivePaid,
              onPress: async () => {
                try {
                  await checkZPayOrder(order.out_trade_no)
                  await load()
                  showModal(t.successTitle, t.paymentSuccess)
                } catch {
                  showModal(t.pendingTitle, t.paymentPending)
                }
              },
            },
            { text: t.cancel, style: 'cancel' },
          ],
        )
      }
    } catch (err: any) {
      showModal(t.errorTitle, err.message || t.failed)
    } finally {
      setRecharging(false)
    }
  }

  if (loading) {
    return (
      <View style={[styles.container, { padding: 16 }]}>
        <SkeletonBox width={'100%' as any} height={140} borderRadius={0} />
        <View style={{ height: 16 }} />
        <SkeletonBox width={'100%' as any} height={48} borderRadius={12} />
        <View style={{ height: 24 }} />
        <SkeletonBox width={120} height={16} borderRadius={4} />
        <View style={{ height: 12 }} />
        {[0, 1, 2].map(i => (
          <View key={i} style={{ marginBottom: 10 }}>
            <SkeletonBox width={'100%' as any} height={64} borderRadius={12} />
          </View>
        ))}
      </View>
    )
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>

      {/* Balance Hero */}
      <LinearGradient colors={['#0f172a', '#1e293b']} style={styles.balanceHero}>
        <View style={styles.balanceHeroContent}>
          <Text style={styles.balanceLabel}>{t.creditsBalance}</Text>
          <Text style={styles.balanceAmount}>
            {wallet?.credits != null ? Number(wallet.credits).toLocaleString() : '--'}
          </Text>
          <View style={styles.balanceBadge}>
            <Icon name="zap" size={12} color="#93c5fd" />
            <Text style={styles.balanceBadgeText}>{lang === 'zh' ? '可用余额' : 'Available'}</Text>
          </View>
        </View>
      </LinearGradient>

      {/* Recharge Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t.rechargeViaAlipay}</Text>

        <View style={styles.amountGrid}>
          {RECHARGE_AMOUNTS.map(amount => (
            <TouchableOpacity
              key={amount}
              style={[styles.amountCard, selectedAmount === amount && styles.amountCardSelected]}
              onPress={() => setSelectedAmount(amount)}
              activeOpacity={0.7}>
              <Text style={[styles.amountValue, selectedAmount === amount && styles.amountValueSelected]}>
                ¥{amount}
              </Text>
              <Text style={[styles.amountCredits, selectedAmount === amount && styles.amountCreditsSelected]}>
                {amount * 10} {t.credits}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={[styles.rechargeButtonShadow, (!selectedAmount || recharging) && styles.rechargeButtonDisabled]}>
        <TouchableOpacity
          style={styles.rechargeButton}
          onPress={() => selectedAmount && handleRecharge(selectedAmount)}
          disabled={!selectedAmount || recharging}
          activeOpacity={0.85}>
          {recharging ? (
            <ActivityIndicator color="#fff" />
          ) : selectedAmount ? (
            <LinearGradient
              colors={['#2563eb', '#1e40af']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.rechargeGradient}>
              <View style={styles.rechargeGradientInner}>
                <Text style={styles.rechargeButtonText}>
                  {`${t.payAmount}${selectedAmount}`}
                </Text>
              </View>
            </LinearGradient>
          ) : (
            <Text style={styles.rechargeButtonTextMuted}>
              {t.selectAmount}
            </Text>
          )}
        </TouchableOpacity>
        </View>
      </View>

      {/* Transactions Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t.recentTransactions}</Text>
        {transactions.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconWrap}>
              <Icon name="credit-card" size={28} color={colors.ink500} />
            </View>
            <Text style={styles.emptyText}>{t.noTransactions}</Text>
            <Text style={styles.emptySubtext}>{lang === 'zh' ? '使用分身后交易记录会出现在这里' : 'Transactions will appear here after using clones'}</Text>
          </View>
        ) : (
          <View style={styles.txListShadow}>
          <View style={styles.txList}>
            {transactions.map((tx, index) => (
              <View key={tx.id} style={[styles.txRow, index === 0 && styles.txRowFirst, index === transactions.length - 1 && styles.txRowLast]}>
                <View style={[styles.txIcon, Number(tx.credits) > 0 ? styles.txIconPositive : styles.txIconNegative]}>
                  <Icon
                    name={Number(tx.credits) > 0 ? 'arrow-down-left' : 'arrow-up-right'}
                    size={14}
                    color={Number(tx.credits) > 0 ? colors.success : colors.ink600}
                  />
                </View>
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
            ))}
          </View>
          </View>
        )}
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingBottom: spacing.xxl + 16,
  },

  // Balance Hero
  balanceHero: {
  },
  balanceHeroContent: {
    paddingTop: 48,
    paddingBottom: 32,
    paddingHorizontal: spacing.lg,
  },
  balanceLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  balanceAmount: {
    fontSize: 48,
    fontWeight: fontWeight.extrabold,
    color: '#ffffff',
    marginTop: 6,
    letterSpacing: -1,
  },
  balanceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginTop: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: 'rgba(37,99,235,0.35)',
    borderRadius: 20,
  },
  balanceBadgeText: {
    fontSize: 11,
    fontWeight: fontWeight.semibold,
    color: '#93c5fd',
    letterSpacing: 0.3,
  },

  // Sections
  section: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
  sectionTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.ink600,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    marginBottom: spacing.md,
  },

  // Amount Grid
  amountGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  amountCard: {
    width: '48%',
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingVertical: spacing.md + 2,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.sand200,
    ...shadows.sm,
  },
  amountCardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary50,
    ...shadows.glow,
  },
  amountValue: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    color: colors.ink900,
  },
  amountValueSelected: {
    color: colors.primary,
  },
  amountCredits: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    color: colors.ink500,
    marginTop: spacing.xs,
  },
  amountCreditsSelected: {
    color: colors.primary600,
  },

  // Recharge Button
  rechargeButtonShadow: {
    borderRadius: 14,
    marginBottom: spacing.sm,
    ...shadows.md,
  },
  rechargeButton: {
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: colors.sand200,
  },
  rechargeButtonDisabled: {
    ...shadows.sm,
  },
  rechargeGradient: {
  },
  rechargeGradientInner: {
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  rechargeButtonText: {
    color: '#fff',
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    letterSpacing: 0.2,
  },
  rechargeButtonTextMuted: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    color: colors.ink500,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },

  // Empty State
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.sand100,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    color: colors.ink700,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: fontSize.sm,
    color: colors.ink500,
    marginTop: 6,
  },

  // Transactions
  txListShadow: {
    borderRadius: 14,
    ...shadows.sm,
  },
  txList: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    overflow: 'hidden',
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.sand200,
  },
  txRowFirst: {
    // placeholder for first-item styling if needed
  },
  txRowLast: {
    borderBottomWidth: 0,
  },
  txIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  txIconPositive: {
    backgroundColor: 'rgba(16,185,129,0.1)',
  },
  txIconNegative: {
    backgroundColor: colors.sand100,
  },
  txLeft: {
    flex: 1,
  },
  txType: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.ink900,
    textTransform: 'capitalize',
  },
  txDate: {
    fontSize: fontSize.xs,
    color: colors.ink500,
    marginTop: 2,
  },
  txAmount: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    fontVariant: ['tabular-nums'],
  },
  txPositive: {
    color: colors.success,
  },
  txNegative: {
    color: colors.ink700,
  },
})
