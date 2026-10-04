import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  RefreshControl,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { mobileApi, type Geofence } from "../lib/api";
import { onLocationUpdate, type LocationState } from "../lib/location";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { IconTile } from "../components/ui/icon-tile";
import { BrandLogo } from "../components/ui/BrandLogo";

import {
  calculateBoundaryMetrics,
  formatDistance,
  formatArea,
  type BoundaryMetrics,
} from "../lib/geo";

export default function SitesScreen() {
  const [sites, setSites] = useState<Geofence[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pos, setPos] = useState<LocationState | null>(null);

  useEffect(() => {
    const unsub = onLocationUpdate((state) => setPos(state));
    return unsub;
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await mobileApi.getGeofences();
      if (res.success) setSites(res.data ?? []);
    } catch (e) {
      console.error("Sites load:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-[#FFFBF0]">
        <ActivityIndicator color="#F59E0B" />
      </View>
    );
  }

  const sitesWithMetrics = sites.map((site) => {
    const metrics: BoundaryMetrics | null = pos
      ? calculateBoundaryMetrics(
          pos.latitude,
          pos.longitude,
          Number(site.latitude),
          Number(site.longitude),
          site.radiusMeters
        )
      : null;

    return { site, metrics };
  });

  sitesWithMetrics.sort((a, b) => {
    if (a.metrics?.isInside && !b.metrics?.isInside) return -1;
    if (!a.metrics?.isInside && b.metrics?.isInside) return 1;
    if (a.metrics && b.metrics) {
      return a.metrics.boundaryDistM - b.metrics.boundaryDistM;
    }
    return 0;
  });

  return (
    <View className="flex-1 bg-[#FFFBF0]">
      {/* Sunny Gradient Header */}
      <View className="p-4 pt-4 pb-2">
        <LinearGradient
          colors={["#FFF7D6", "#FFFBF0", "#E0F2FE"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          className="rounded-3xl p-4 border border-[#F3E8C8] shadow-solar"
        >
          <View className="flex-row items-center justify-between">
            <View>
              <View className="flex-row items-center gap-1.5">
                <BrandLogo size={20} />
                <Text className="text-[12px] font-bold text-[#D97706] uppercase tracking-wider">
                  Sologix Energy
                </Text>
              </View>
              <Text className="text-[26px] font-extrabold tracking-tight text-[#1F2937] mt-0.5">
                Assigned Sites
              </Text>
              <Text className="text-[12px] text-[#6B7280]">
                Authorized operating geofences &amp; facilities
              </Text>
            </View>

            {pos && (
              <Badge variant="outline" className="font-mono bg-white/80 border-[#F3E8C8]">
                ±{pos.accuracy}m
              </Badge>
            )}
          </View>
        </LinearGradient>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerClassName="p-4 pt-1 pb-16 gap-3"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor="#F59E0B"
          />
        }
      >
        {sitesWithMetrics.length === 0 ? (
          <View className="items-center justify-center py-20 px-6">
            <View className="w-16 h-16 rounded-full bg-white border border-[#F3E8C8] items-center justify-center mb-3 shadow-warm">
              <Ionicons name="location-outline" size={28} color="#D97706" />
            </View>
            <Text className="text-[17px] font-bold text-[#1F2937]">
              No Sites Assigned
            </Text>
            <Text className="text-[13px] text-[#6B7280] text-center mt-1 leading-relaxed">
              Geofence sites assigned by your administrator will appear here.
            </Text>
          </View>
        ) : (
          sitesWithMetrics.map(({ site, metrics }) => {
            const isInside = metrics?.isInside ?? false;

            return (
              <Card
                key={site.id}
                className={isInside ? "border-[#16A34A]/50 bg-[#DCFCE7]/30" : "border-[#F3E8C8] bg-white"}
              >
                <View className="flex-row items-start justify-between gap-3">
                  <View className="flex-row items-center gap-3 flex-1">
                    <IconTile
                      name="business"
                      bg={isInside ? "bg-[#DCFCE7]" : "bg-[#FEF3C7]"}
                      color={isInside ? "#16A34A" : "#D97706"}
                    />
                    <View className="flex-1">
                      <View className="flex-row items-center gap-2 mb-0.5">
                        <Text className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider">
                          {site.type}
                        </Text>
                        {site.active && (
                          <View className="w-1.5 h-1.5 rounded-full bg-[#16A34A]" />
                        )}
                      </View>

                      <Text className="text-[16px] font-bold text-[#1F2937]">
                        {site.name}
                      </Text>

                      {site.address && (
                        <Text className="text-[13px] text-[#6B7280] mt-0.5" numberOfLines={1}>
                          {site.address}
                        </Text>
                      )}
                    </View>
                  </View>

                  {metrics !== null ? (
                    isInside ? (
                      <Badge variant="success">
                        ✓ Inside by {Math.round(Math.abs(metrics.boundaryDistM))}m
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="font-mono">
                        {Math.round(metrics.boundaryDistM)}m to boundary
                      </Badge>
                    )
                  ) : null}
                </View>

                {/* Boundary Proximity Progress Bar */}
                {metrics !== null && (
                  <View className="gap-1 mt-2">
                    <View className="h-1.5 bg-[#FEF3C7] rounded-full overflow-hidden">
                      <View
                        className={`h-full rounded-full ${
                          isInside ? "bg-[#16A34A]" : "bg-[#F59E0B]"
                        }`}
                        style={{
                          width: `${isInside ? 100 : Math.round(metrics.proximityRatio * 100)}%`,
                        }}
                      />
                    </View>
                    <Text className="text-[11px] text-[#6B7280]">
                      {isInside
                        ? `Inside perimeter · ±${metrics.adaptiveHysteresisM.toFixed(0)}m tolerance halo`
                        : `${Math.round(metrics.boundaryDistM)}m to boundary (${formatDistance(metrics.centerDistM)} to centre)`}
                    </Text>
                  </View>
                )}

                {/* Coordinates & Area Details */}
                <View className="pt-2 border-t border-[#F3E8C8] flex-row items-center justify-between">
                  <Text className="text-[11px] font-mono text-[#6B7280]">
                    {Number(site.latitude).toFixed(4)}, {Number(site.longitude).toFixed(4)}
                  </Text>
                  <View className="flex-row items-center gap-2">
                    <Text className="text-[11px] text-[#6B7280]">
                      {formatArea(site.radiusMeters)}
                    </Text>
                    <Text className="text-[11px] font-semibold text-[#1F2937]">
                      {site.radiusMeters}m radius
                    </Text>
                  </View>
                </View>
              </Card>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}
