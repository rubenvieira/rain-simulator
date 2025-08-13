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
import { Settings } from "lucide-react";
import { RainSettings } from "@/pages/Index";

interface SettingsPanelProps {
  settings: RainSettings;
  onSettingsChange: (newSettings: Partial<RainSettings>) => void;
  onRefresh: () => void;
}

export function SettingsPanel({ settings, onSettingsChange, onRefresh }: SettingsPanelProps) {
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        onSettingsChange({ backgroundUrl: event.target?.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="icon" className="fixed bottom-5 left-5 z-50 rounded-full h-12 w-12">
          <Settings className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[320px] sm:w-[400px]">
        <SheetHeader>
          <SheetTitle>Rain Simulator Settings</SheetTitle>
          <SheetDescription>
            Adjust the properties of the rain to create your perfect storm.
          </SheetDescription>
        </SheetHeader>
        <div className="grid gap-6 py-6">
          <div className="grid gap-3">
            <Label htmlFor="amount">Amount ({settings.amount})</Label>
            <Slider
              id="amount"
              min={100}
              max={2500}
              step={10}
              value={[settings.amount]}
              onValueChange={([value]) => onSettingsChange({ amount: value })}
            />
          </div>
          <div className="grid gap-3">
            <Label htmlFor="size">Size ({settings.size})</Label>
            <Slider
              id="size"
              min={1}
              max={10}
              step={1}
              value={[settings.size]}
              onValueChange={([value]) => onSettingsChange({ size: value })}
            />
          </div>
          <div className="grid gap-3">
            <Label htmlFor="speed">Speed ({settings.speed})</Label>
            <Slider
              id="speed"
              min={1}
              max={10}
              step={1}
              value={[settings.speed]}
              onValueChange={([value]) => onSettingsChange({ speed: value })}
            />
          </div>
          <div className="grid gap-3">
            <Label htmlFor="stickiness">Stickiness ({settings.stickiness})</Label>
            <Slider
              id="stickiness"
              min={1}
              max={10}
              step={1}
              value={[settings.stickiness]}
              onValueChange={([value]) => onSettingsChange({ stickiness: value })}
            />
          </div>
          <div className="grid gap-3">
            <Label htmlFor="sound">Sound ({settings.sound}%)</Label>
            <Slider
              id="sound"
              min={0}
              max={100}
              step={1}
              value={[settings.sound]}
              onValueChange={([value]) => onSettingsChange({ sound: value })}
            />
          </div>
          <div className="grid gap-3">
            <Label htmlFor="bg-upload">Custom Background</Label>
            <Input id="bg-upload" type="file" accept="image/*" onChange={handleFileChange} className="cursor-pointer" />
          </div>
          <Button onClick={onRefresh}>Refresh Rain</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}