/** Shared shape of /api/search responses. */
export interface SearchResultEmployee {
  id: string;
  fullName: string;
  employeeCode: string;
  position: string;
  department: string | null;
  status: string;
}

export interface SearchResults {
  employees: SearchResultEmployee[];
}