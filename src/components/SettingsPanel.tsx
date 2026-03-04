"use client";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Settings, RotateCcw, CloudRain, Zap } from "lucide-react";
import type { RainSettings } from "@/simulation/RainSimulation";

interface SettingsPanelProps {
  settings: RainSettings;
  onSettingsChange: (newSettings: Partial<RainSettings>) => void;
  onRefresh: () => void;
}

export function SettingsPanel({
  settings,
  onSettingsChange,
  onRefresh,
}: SettingsPanelProps) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="fixed bottom-5 left-5 z-50 rounded-full h-14 w-14 bg-black/40 backdrop-blur-xl border-white/20 hover:bg-black/60 shadow-2xl"
        >
          <Settings className="h-6 w-6 text-white" />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="left"
        className="w-[350px] bg-black/80 backdrop-blur-2xl border-white/10 overflow-y-auto"
      >
        <SheetHeader>
          <SheetTitle className="text-white flex items-center gap-2">
            <CloudRain className="h-5 w-5" />
            Rain Controls
          </SheetTitle>
          <SheetDescription className="text-white/50">
            Hyper-realistic rain simulation
          </SheetDescription>
        </SheetHeader>

        <div className="grid gap-6 py-6">
          <div className="grid gap-3">
            <div className="flex justify-between">
              <Label className="text-white/80">Rain Intensity</Label>
              <span className="text-white/50 text-sm">{settings.intensity}%</span>
            </div>
            <Slider
              min={5} max={100}
              value={[settings.intensity]}
              onValueChange={([v]) => onSettingsChange({ intensity: v })}
            />
          </div>

          <div className="grid gap-3">
            <div className="flex justify-between">
              <Label className="text-white/80">Drop Size</Label>
              <span className="text-white/50 text-sm">{settings.dropletSize}</span>
            </div>
            <Slider
              min={1} max={10}
              value={[settings.dropletSize]}
              onValueChange={([v]) => onSettingsChange({ dropletSize: v })}
            />
          </div>

          <div className="grid gap-3">
            <div className="flex justify-between">
              <Label className="text-white/80">Gravity</Label>
              <span className="text-white/50 text-sm">{settings.gravity}</span>
            </div>
            <Slider
              min={1} max={10}
              value={[settings.gravity]}
              onValueChange={([v]) => onSettingsChange({ gravity: v })}
            />
          </div>

          <div className="grid gap-3">
            <div className="flex justify-between">
              <Label className="text-white/80">Surface Tension</Label>
              <span className="text-white/50 text-sm">{settings.surfaceTension}</span>
            </div>
            <Slider
              min={1} max={10}
              value={[settings.surfaceTension]}
              onValueChange={([v]) => onSettingsChange({ surfaceTension: v })}
            />
          </div>

          <Separator className="bg-white/10" />

          <div className="grid gap-3">
            <div className="flex justify-between">
              <Label className="text-white/80">Wind Speed</Label>
              <span className="text-white/50 text-sm">{settings.windSpeed}%</span>
            </div>
            <Slider
              min={0} max={100}
              value={[settings.windSpeed]}
              onValueChange={([v]) => onSettingsChange({ windSpeed: v })}
            />
          </div>

          <div className="grid gap-3">
            <div className="flex justify-between">
              <Label className="text-white/80">Wind Direction</Label>
              <span className="text-white/50 text-sm">{settings.windAngle}°</span>
            </div>
            <Slider
              min={-45} max={45}
              value={[settings.windAngle]}
              onValueChange={([v]) => onSettingsChange({ windAngle: v })}
            />
          </div>

          <Separator className="bg-white/10" />

          <div className="grid gap-3">
            <div className="flex justify-between">
              <Label className="text-white/80">Bokeh Intensity</Label>
              <span className="text-white/50 text-sm">{settings.bokehIntensity}%</span>
            </div>
            <Slider
              min={0} max={100}
              value={[settings.bokehIntensity]}
              onValueChange={([v]) => onSettingsChange({ bokehIntensity: v })}
            />
          </div>

          <div className="grid gap-3">
            <div className="flex justify-between">
              <Label className="text-white/80">Background Blur</Label>
              <span className="text-white/50 text-sm">{settings.glassBlur}%</span>
            </div>
            <Slider
              min={0} max={100}
              value={[settings.glassBlur]}
              onValueChange={([v]) => onSettingsChange({ glassBlur: v })}
            />
          </div>

          <div className="grid gap-3">
            <div className="flex justify-between">
              <Label className="text-white/80">Fog / Condensation</Label>
              <span className="text-white/50 text-sm">{settings.fogDensity}%</span>
            </div>
            <Slider
              min={0} max={100}
              value={[settings.fogDensity]}
              onValueChange={([v]) => onSettingsChange({ fogDensity: v })}
            />
          </div>

          <Separator className="bg-white/10" />

          <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 p-4">
            <Label className="flex items-center gap-2 text-white/80">
              <Zap className="h-4 w-4" />
              Thunder & Lightning
            </Label>
            <Switch
              checked={settings.thunder}
              onCheckedChange={(v) => onSettingsChange({ thunder: v })}
            />
          </div>

          {settings.thunder && (
            <div className="grid gap-3 pl-4">
              <div className="flex justify-between">
                <Label className="text-white/70">Frequency</Label>
                <span className="text-white/50 text-sm">{settings.thunderFrequency}</span>
              </div>
              <Slider
                min={1} max={10}
                value={[settings.thunderFrequency]}
                onValueChange={([v]) => onSettingsChange({ thunderFrequency: v })}
              />
            </div>
          )}

          <Separator className="bg-white/10" />

          <Button
            onClick={onRefresh}
            className="w-full bg-white/10 hover:bg-white/20 text-white"
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Refresh Scene
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
