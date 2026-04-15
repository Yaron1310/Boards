import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';
import * as apiService from '@/services/geminiService';
import type { Course, UserRole } from '@/types';
import { UserRole as UserRoleEnum } from '@/types';

export const useCoursesQuery = (enabled = true) => {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: queryKeys.courses.all,
    queryFn: async () => {
      const res = await apiService.getCourses({ limit: 200 });
      // getCourses() returns course summaries without the lessons array.
      // fetchCourseWithLessons() merges full lesson data into this cache.
      // Preserve those lessons so a background refetch (e.g. on window
      // focus) doesn't wipe them and leave pages stuck on a spinner.
      const prev = queryClient.getQueryData<Course[]>(queryKeys.courses.all);
      if (prev) {
        return res.data.map(course => {
          const cached = prev.find(c => c.id === course.id);
          return cached?.lessons ? { ...course, lessons: cached.lessons } : course;
        });
      }
      return res.data;
    },
    enabled,
    staleTime: 5 * 60 * 1000,
  });
};

export const useArchivedCoursesQuery = (enabled = false) => {
  return useQuery({
    queryKey: queryKeys.courses.archived,
    queryFn: () => apiService.getArchivedCourses(),
    enabled,
    staleTime: 5 * 60 * 1000,
  });
};

export const useMyProgressQuery = (enabled = true) => {
  return useQuery({
    queryKey: queryKeys.progress.my,
    queryFn: () => apiService.getMyProgress(),
    enabled,
  });
};

export const useOrgProgressQuery = (userRole?: UserRole) => {
  const enabled = userRole === UserRoleEnum.ACADEMY_ADMIN ||
    userRole === UserRoleEnum.SYSTEM_ADMIN ||
    userRole === UserRoleEnum.ORGANIZATION_ADMIN;
  return useQuery({
    queryKey: queryKeys.progress.organization,
    queryFn: () => apiService.getOrganizationProgress(),
    enabled,
  });
};
