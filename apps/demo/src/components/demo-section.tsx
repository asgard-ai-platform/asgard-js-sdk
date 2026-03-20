'use client';

import type { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';

interface DemoSectionProps {
  title: string;
  description?: string;
  children: ReactNode;
}

export function DemoSection({ title, description, children }: DemoSectionProps): ReactNode {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {description && <p className="text-muted-foreground mt-1">{description}</p>}
      </div>
      <Card className="shadow-sm border-border/70">
        <CardContent className="p-6">{children}</CardContent>
      </Card>
    </div>
  );
}
