'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { usePathname, Link, useRouter } from '@/i18n/routing';
import { useLocale } from 'next-intl';
import { useTheme } from 'next-themes';
import {
  Home,
  Maximize2,
  LayoutTemplate,
  ToggleLeft,
  Palette,
  ShieldCheck,
  Zap,
  Paintbrush,
  Rocket,
  Send,
  PanelTop,
  RefreshCw,
  FileText,
  Lock,
  Sun,
  Moon,
  Monitor,
  Languages,
  Package,
} from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  SidebarSeparator,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';

interface NavItem {
  titleKey: string;
  href: string;
  icon: ReactNode;
}

interface NavGroup {
  labelKey: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    labelKey: 'gettingStarted',
    items: [
      { titleKey: 'home', href: '/', icon: <Home size={16} /> },
      { titleKey: 'fullscreen', href: '/fullscreen', icon: <Maximize2 size={16} /> },
    ],
  },
  {
    labelKey: 'templates',
    items: [{ titleKey: 'templates', href: '/templates', icon: <LayoutTemplate size={16} /> }],
  },
  {
    labelKey: 'configuration',
    items: [
      { titleKey: 'features', href: '/config/features', icon: <ToggleLeft size={16} /> },
      { titleKey: 'themeCustomization', href: '/config/theme', icon: <Palette size={16} /> },
      { titleKey: 'auth', href: '/config/auth', icon: <ShieldCheck size={16} /> },
    ],
  },
  {
    labelKey: 'advanced',
    items: [
      { titleKey: 'events', href: '/advanced/events', icon: <Zap size={16} /> },
      { titleKey: 'customRenderer', href: '/advanced/custom-renderer', icon: <Paintbrush size={16} /> },
      { titleKey: 'dynamicPayload', href: '/advanced/dynamic-payload', icon: <Rocket size={16} /> },
      { titleKey: 'beforeSend', href: '/advanced/before-send', icon: <Send size={16} /> },
      { titleKey: 'customHeader', href: '/advanced/custom-header', icon: <PanelTop size={16} /> },
      { titleKey: 'autoReset', href: '/advanced/auto-reset', icon: <RefreshCw size={16} /> },
      { titleKey: 'markdown', href: '/advanced/markdown', icon: <FileText size={16} /> },
      { titleKey: 'private', href: '/advanced/private', icon: <Lock size={16} /> },
    ],
  },
];

export function AppSidebar(): ReactNode {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const locale = useLocale();
  const router = useRouter();
  const { setTheme, theme } = useTheme();

  const toggleLocale = (): void => {
    const newLocale = locale === 'en-US' ? 'zh-TW' : 'en-US';
    router.replace(pathname, { locale: newLocale });
  };

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <Link href="/" className="flex items-center gap-2 font-bold text-lg">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Package size={14} />
          </div>
          <span className="tracking-tight">Asgard SDK</span>
          <Badge variant="secondary" className="text-[10px]">v0.2.18</Badge>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        {navGroups.map(group => (
          <SidebarGroup key={group.labelKey}>
            <SidebarGroupLabel>{t(group.labelKey)}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map(item => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={pathname === item.href}>
                      <Link href={item.href}>
                        {item.icon}
                        <span>{t(item.titleKey)}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarSeparator />
      <SidebarFooter className="p-4">
        <div className="flex items-center justify-between">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={toggleLocale} className="h-8 w-8">
                  <Languages size={16} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{locale === 'en-US' ? '切換到中文' : 'Switch to English'}</TooltipContent>
            </Tooltip>

            <div className="flex gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={theme === 'light' ? 'secondary' : 'ghost'}
                    size="icon"
                    onClick={() => setTheme('light')}
                    className="h-8 w-8"
                  >
                    <Sun size={16} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Light</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={theme === 'dark' ? 'secondary' : 'ghost'}
                    size="icon"
                    onClick={() => setTheme('dark')}
                    className="h-8 w-8"
                  >
                    <Moon size={16} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Dark</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={theme === 'system' ? 'secondary' : 'ghost'}
                    size="icon"
                    onClick={() => setTheme('system')}
                    className="h-8 w-8"
                  >
                    <Monitor size={16} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>System</TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
