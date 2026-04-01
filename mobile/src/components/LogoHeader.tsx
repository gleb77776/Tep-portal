import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../context/ThemeContext';

type Props = {
  subtitle?: string;
  compact?: boolean;
};

/** Как в App.css .logo-acronym — линейный градиент и «перелив» background-position */
const SHIMMER_COLORS = [
  '#8AD4F0',
  '#59C5E9',
  '#45B8E6',
  '#2E8FC4',
  '#2071A8',
  '#1C679C',
  '#45B8E6',
  '#8AD4F0',
] as const;

const SHIMMER_MS = 5000;

type MaskProps = { compact?: boolean };

/** Маска: непрозрачные буквы (как clip для градиента на вебе) */
function LogoTextMask({ compact }: MaskProps) {
  return (
    <View style={styles.maskRow}>
      <Text style={[styles.mAcronym, compact && styles.mAcronymCompact]}>НПС</Text>
      <Text style={[styles.mSlash, compact && styles.mSlashCompact]}>//</Text>
      <View>
        <Text style={[styles.mInstitute, compact && styles.mInstituteCompact]}>ИНСТИТУТ</Text>
        <Text style={[styles.mName, compact && styles.mNameCompact]}>ТЕПЛОЭЛЕКТРОПРОЕКТ</Text>
      </View>
    </View>
  );
}

/** Статичный вариант (веб или fallback) */
function LogoTextStatic({ compact }: MaskProps) {
  return (
    <View style={styles.logoRow}>
      <Text style={[styles.acronym, compact && styles.acronymCompact]}>НПС</Text>
      <Text style={[styles.slash, compact && styles.slashCompact]}>//</Text>
      <View style={styles.textBlock}>
        <Text style={[styles.institute, compact && styles.instituteCompact]}>ИНСТИТУТ</Text>
        <Text style={[styles.name, compact && styles.nameCompact]}>ТЕПЛОЭЛЕКТРОПРОЕКТ</Text>
      </View>
    </View>
  );
}

function AnimatedLogoShimmer({ compact, trackWidth }: MaskProps & { trackWidth: number }) {
  const anim = useRef(new Animated.Value(0)).current;
  const w = Math.max(trackWidth, 260);
  const gradientW = w * 2.4;
  const slideRange = Math.max(gradientW - w, 80);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, {
          toValue: 1,
          duration: SHIMMER_MS,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(anim, {
          toValue: 0,
          duration: SHIMMER_MS,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);

  const translateX = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -slideRange],
  });

  const rowH = compact ? 40 : 48;

  return (
    <MaskedView
      style={[styles.maskedWrap, { height: rowH, width: w }]}
      maskElement={
        <View style={[styles.maskHost, { width: w, height: rowH }]}>
          <LogoTextMask compact={compact} />
        </View>
      }
    >
      <View style={[styles.shimmerClip, { width: w, height: rowH }]}>
        <Animated.View
          style={{
            width: gradientW,
            height: rowH,
            transform: [{ translateX }],
          }}
        >
          <LinearGradient
            colors={SHIMMER_COLORS}
            locations={[0, 0.12, 0.25, 0.45, 0.65, 0.78, 0.9, 1]}
            start={{ x: 0, y: 0.25 }}
            end={{ x: 1, y: 0.75 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      </View>
    </MaskedView>
  );
}

export default function LogoHeader({ subtitle, compact }: Props) {
  const { colors } = useTheme();
  const [trackW, setTrackW] = useState(() => Dimensions.get('window').width);
  const useShimmer = Platform.OS !== 'web';

  return (
    <View style={styles.wrap}>
      <View
        style={[styles.strip, compact && styles.stripCompact, { backgroundColor: colors.logoStripStart }]}
        onLayout={(e) => setTrackW(e.nativeEvent.layout.width)}
      >
        <View style={styles.stripInner}>
          {useShimmer ? (
            <AnimatedLogoShimmer compact={compact} trackWidth={trackW} />
          ) : (
            <LogoTextStatic compact={compact} />
          )}
        </View>
      </View>
      {subtitle ? (
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>{subtitle}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%' },
  strip: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stripCompact: { paddingVertical: 10 },
  stripInner: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  maskedWrap: {
    alignSelf: 'center',
  },
  maskHost: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  maskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  mAcronym: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 1,
    color: '#000',
  },
  mAcronymCompact: { fontSize: 18 },
  mSlash: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 2,
    color: '#000',
  },
  mSlashCompact: { fontSize: 15 },
  mInstitute: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1.2,
    color: '#000',
  },
  mInstituteCompact: { fontSize: 9 },
  mName: {
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.8,
    color: '#000',
    marginTop: 1,
  },
  mNameCompact: { fontSize: 8 },
  shimmerClip: {
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  textBlock: { justifyContent: 'center' },
  acronym: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 1,
    color: '#b8e8ff',
    textShadowColor: 'rgba(0, 30, 60, 0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  acronymCompact: { fontSize: 18 },
  slash: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 2,
    color: '#9bdcff',
    opacity: 0.95,
  },
  slashCompact: { fontSize: 15 },
  institute: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1.2,
    color: '#e8f4ff',
  },
  instituteCompact: { fontSize: 9 },
  name: {
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.8,
    color: '#e8f4ff',
    marginTop: 1,
  },
  nameCompact: { fontSize: 8 },
  subtitle: {
    textAlign: 'center',
    fontSize: 14,
    marginTop: 12,
    paddingHorizontal: 20,
  },
});
