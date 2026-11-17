/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import { BookOpen, House, ShieldCheck } from 'lucide-react';

import { NavigationItem } from '@/types/navigation';

/**
 * Top-level navigation. Owner: Shreya. Paths must match routes in App.tsx.
 * `platformRoles` hides an item from everyone else (the server still checks access).
 */
export const navigationConfig: NavigationItem[] = [
  {
    id: 'home',
    path: '/',
    icon: House,
    iconActive: House,
    label: 'Home',
    tooltip: 'Home',
  },
  {
    id: 'courses',
    path: '/courses',
    icon: BookOpen,
    iconActive: BookOpen,
    label: 'Courses',
    tooltip: 'My courses',
  },
  {
    id: 'admin',
    path: '/admin',
    icon: ShieldCheck,
    iconActive: ShieldCheck,
    label: 'Admin',
    tooltip: 'Admin console',
    platformRoles: ['ADMIN'],
  },
];
