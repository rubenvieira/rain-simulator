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
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Settings, RotateCcw, CloudRain, Cloud, CloudLightning, Wind } from "lucide-react";
import type { RainSettings } from "@/simulation/RainSimulation";

type BackgroundType = 'city' | 'highway' | 'nature' | 'custom';
type PresetType = 'drizzle' | 'steady' | 'storm' | 'hurricane' | 'custom';

interface SettingsPanelProps {
  settings: RainSettings;
  preset: PresetType;
  backgroundType: BackgroundType;
  soundVolume: number;
  onSettingsChange: (newSettings: Partial<RainSettings>) => void;
  onPresetChange: (preset: PresetType) => void;
  onBackgroundChange: (type: BackgroundType) => void;
  onImageUpload: (url: string) => void;
  onSoundVolumeChange: (volume: number) => void;
  onRefresh: () => void;
}

const presetIcons: Record<PresetType, React.ReactNode> = {
  drizzle: <Cloud className="h-4 w-4" />,
  steady: <CloudRain className="h-4 w-4" />,
  storm: <CloudLightning className="h-4 w-4" />,
  hurricane: <Wind className="h-4 w-4" />,
  custom: <Settings className="h-4 w-4" />,
};

export function SettingsPanel({
  settings,
  preset,
  backgroundType,
  soundVolume,
  onSettingsChange,
  onPresetChange,
  onBackgroundChange,
  onImageUpload,
  onSoundVolumeChange,
  onRefresh,
}: SettingsPanelProps) {
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        onImageUpload(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="fixed bottom-5 left-5 z-50 rounded-full h-14 w-14 bg-black/40 backdrop-blur-md border-white/20 hover:bg-black/60 hover:border-white/40 transition-all shadow-lg"
        >
          <Settings className="h-6 w-6 text-white" />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="left"
        className="w-[350px] sm:w-[420px] bg-black/80 backdrop-blur-xl border-white/10 overflow-y-auto"
      >
        <SheetHeader>
          <SheetTitle className="text-white text-xl">Rain Simulator</SheetTitle>
          <SheetDescription className="text-white/60">
            Craft your perfect storm with realistic rain physics
          </SheetDescription>
        </SheetHeader>

        <div className="grid gap-6 py-6">
          {/* Presets */}
          <div className="grid gap-3">
            <Label className="text-white/80">Weather Preset</Label>
            <div className="grid grid-cols-4 gap-2">
              {(['drizzle', 'steady', 'storm', 'hurricane'] as PresetType[]).map((p) => (
                <Button
                  key={p}
                  variant={preset === p ? 'default' : 'outline'}
                  size="sm"
                  className={
                    preset === p
                      ? 'bg-blue-600 hover:bg-blue-700 text-white'
                      : 'bg-white/5 border-white/20 text-white/80 hover:bg-white/10 hover:text-white'
                  }
                  onClick={() => onPresetChange(p)}
                >
                  <span className="flex items-center gap-1.5 capitalize">
                    {presetIcons[p]}
                    <span className="hidden sm:inline">{p}</span>
                  </span>
                </Button>
              ))}
            </div>
          </div>

          <Separator className="bg-white/10" />

          {/* Background */}
          <div className="grid gap-3">
            <Label className="text-white/80">Background Scene</Label>
            <Select value={backgroundType} onValueChange={(v) => onBackgroundChange(v as BackgroundType)}>
              <SelectTrigger className="bg-white/5 border-white/20 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-white/20">
                <SelectItem value="city">City Night</SelectItem>
                <SelectItem value="highway">Highway</SelectItem>
                <SelectItem value="nature">Countryside</SelectItem>
                <SelectItem value="custom">Custom Image</SelectItem>
              </SelectContent>
            </Select>
            {backgroundType === 'custom' && (
              <Input
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="cursor-pointer bg-white/5 border-white/20 text-white file:text-white/60"
              />
            )}
          </div>

          <Separator className="bg-white/10" />

          {/* Rain Settings */}
          <div className="grid gap-5">
            <h3 className="text-sm font-medium text-white/90">Rain Properties</h3>

            <div className="grid gap-3">
              <div className="flex justify-between items-center">
                <Label className="text-white/70">Intensity</Label>
                <span className="text-xs text-white/50">{settings.intensity}%</span>
              </div>
              <Slider
                min={5}
                max={100}
                step={1}
                value={[settings.intensity]}
                onValueChange={([value]) => onSettingsChange({ intensity: value })}
                className="[&_[role=slider]]:bg-blue-500"
              />
            </div>

            <div className="grid gap-3">
              <div className="flex justify-between items-center">
                <Label className="text-white/70">Droplet Size</Label>
                <span className="text-xs text-white/50">{settings.dropletSize}</span>
              </div>
              <Slider
                min={1}
                max={10}
                step={1}
                value={[settings.dropletSize]}
                onValueChange={([value]) => onSettingsChange({ dropletSize: value })}
                className="[&_[role=slider]]:bg-blue-500"
              />
            </div>

            <div className="grid gap-3">
              <div className="flex justify-between items-center">
                <Label className="text-white/70">Gravity</Label>
                <span className="text-xs text-white/50">{settings.gravity}</span>
              </div>
              <Slider
                min={1}
                max={10}
                step={1}
                value={[settings.gravity]}
                onValueChange={([value]) => onSettingsChange({ gravity: value })}
                className="[&_[role=slider]]:bg-blue-500"
              />
            </div>

            <div className="grid gap-3">
              <div className="flex justify-between items-center">
                <Label className="text-white/70">Surface Tension</Label>
                <span className="text-xs text-white/50">{settings.surfaceTension}</span>
              </div>
              <Slider
                min={1}
                max={10}
                step={1}
                value={[settings.surfaceTension]}
                onValueChange={([value]) => onSettingsChange({ surfaceTension: value })}
                className="[&_[role=slider]]:bg-blue-500"
              />
            </div>
          </div>

          <Separator className="bg-white/10" />

          {/* Wind Settings */}
          <div className="grid gap-5">
            <h3 className="text-sm font-medium text-white/90">Wind</h3>

            <div className="grid gap-3">
              <div className="flex justify-between items-center">
                <Label className="text-white/70">Wind Speed</Label>
                <span className="text-xs text-white/50">{settings.windSpeed}%</span>
              </div>
              <Slider
                min={0}
                max={100}
                step={1}
                value={[settings.windSpeed]}
                onValueChange={([value]) => onSettingsChange({ windSpeed: value })}
                className="[&_[role=slider]]:bg-cyan-500"
              />
            </div>

            <div className="grid gap-3">
              <div className="flex justify-between items-center">
                <Label className="text-white/70">Wind Direction</Label>
                <span className="text-xs text-white/50">{settings.windAngle}°</span>
              </div>
              <Slider
                min={-45}
                max={45}
                step={1}
                value={[settings.windAngle]}
                onValueChange={([value]) => onSettingsChange({ windAngle: value })}
                className="[&_[role=slider]]:bg-cyan-500"
              />
            </div>
          </div>

          <Separator className="bg-white/10" />

          {/* Thunder */}
          <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 p-4">
            <Label htmlFor="thunder-switch" className="flex flex-col space-y-1">
              <span className="text-white/90 flex items-center gap-2">
                <CloudLightning className="h-4 w-4" />
                Thunder & Lightning
              </span>
              <span className="font-normal text-xs text-white/50">
                Random flashes with delayed thunder
              </span>
            </Label>
            <Switch
              id="thunder-switch"
              checked={settings.thunder}
              onCheckedChange={(checked) => onSettingsChange({ thunder: checked })}
            />
          </div>

          {settings.thunder && (
            <div className="grid gap-3 pl-2">
              <div className="flex justify-between items-center">
                <Label className="text-white/70">Frequency</Label>
                <span className="text-xs text-white/50">{settings.thunderFrequency}</span>
              </div>
              <Slider
                min={1}
                max={10}
                step={1}
                value={[settings.thunderFrequency]}
                onValueChange={([value]) => onSettingsChange({ thunderFrequency: value })}
                className="[&_[role=slider]]:bg-yellow-500"
              />
            </div>
          )}

          <Separator className="bg-white/10" />

          {/* Sound */}
          <div className="grid gap-3">
            <div className="flex justify-between items-center">
              <Label className="text-white/80">Sound Volume</Label>
              <span className="text-xs text-white/50">{soundVolume}%</span>
            </div>
            <Slider
              min={0}
              max={100}
              step={1}
              value={[soundVolume]}
              onValueChange={([value]) => onSoundVolumeChange(value)}
              className="[&_[role=slider]]:bg-green-500"
            />
            {soundVolume === 0 && (
              <p className="text-xs text-white/40">Click anywhere to enable audio</p>
            )}
          </div>

          <Separator className="bg-white/10" />

          {/* Refresh Button */}
          <Button
            onClick={onRefresh}
            className="w-full bg-white/10 hover:bg-white/20 text-white border border-white/20"
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Refresh Rain
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}