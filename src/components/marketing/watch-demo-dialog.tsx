"use client";

import { PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export function WatchDemoDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="secondary" size="lg">
          <PlayCircle className="mr-2 h-4 w-4" />
          Ver demo
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Demo macet.ai</DialogTitle>
          <DialogDescription>Veja como um upload vira múltiplos clipes prontos para redes sociais.</DialogDescription>
        </DialogHeader>
        <div className="overflow-hidden rounded-lg border bg-black">
          <video controls playsInline preload="metadata" poster="/hero/hero.jpg" className="aspect-video w-full">
            <source src="/hero/hero.mp4" type="video/mp4" />
          </video>
        </div>
      </DialogContent>
    </Dialog>
  );
}
