import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { fetchAuthSession } from '@aws-amplify/auth';
import { ApiService } from '../../services/api.service';
import { ChangeDetectorRef } from '@angular/core';
import { GridApi, GridReadyEvent, ColDef } from 'ag-grid-community';

export interface CombinedDataFileRow {
  date: string;
  patient: string;
  shimmer1: string;
  shimmer2: string;
  shimmer1_file: string;
  shimmer2_file: string;
}

@Component({
  selector: 'app-daily-aggregator',
  standalone: false,
  templateUrl: './daily-aggregator.html',
  styleUrls: ['./daily-aggregator.css']
})
export class DailyAggregatorPage implements OnInit {
  isLoading = false;
  isLoadingFiles = false;
  selectedDate: string = '';
  selectedDateForFiles: string = '';
  result: any = null;
  error: string = '';
  
  // Combined data files properties
  private gridApi?: GridApi;
  rowData: CombinedDataFileRow[] = [];
  filesError: string = '';
  quickFilterText = '';

  columnDefs: ColDef[] = [
    { field: 'date', headerName: 'Date', sortable: true, filter: 'agTextColumnFilter', width: 150, flex: 0, suppressSizeToFit: true },
    { field: 'patient', headerName: 'Patient', sortable: true, filter: 'agTextColumnFilter', width: 130, flex: 0, suppressSizeToFit: true },
    { field: 'shimmer1', headerName: 'Shimmer1', sortable: true, filter: 'agTextColumnFilter', width: 200, flex: 0, suppressSizeToFit: true },
    { field: 'shimmer2', headerName: 'Shimmer2', sortable: true, filter: 'agTextColumnFilter', width: 200, flex: 0, suppressSizeToFit: true },
    { 
      field: 'shimmer1_file', 
      headerName: 'Shimmer1 File', 
      sortable: true, 
      filter: 'agTextColumnFilter',
      width: 300,
      flex: 0,
      suppressSizeToFit: true,
      cellRenderer: (params: any) => {
        if (!params.value || params.value === '-') return '-';
        const fileName = params.value.length > 40 ? params.value.substring(0, 40) + '...' : params.value;
        return `<span title="${params.value}">${fileName}</span>`;
      }
    },
    { 
      field: 'shimmer2_file', 
      headerName: 'Shimmer2 File', 
      sortable: true, 
      filter: 'agTextColumnFilter',
      width: 300,
      flex: 0,
      suppressSizeToFit: true,
      cellRenderer: (params: any) => {
        if (!params.value || params.value === '-') return '-';
        const fileName = params.value.length > 40 ? params.value.substring(0, 40) + '...' : params.value;
        return `<span title="${params.value}">${fileName}</span>`;
      }
    }
  ];

  defaultColDef: ColDef = {
    resizable: true,
    sortable: true,
    filter: true,
    flex: 0,
    suppressSizeToFit: true
  };

  constructor(private router: Router, private apiService: ApiService, private cdr: ChangeDetectorRef) {}

  async ngOnInit() {
    await this.checkAuth();
  }

  async checkAuth() {
    try {
      const session = await fetchAuthSession();
      const isAuth = session?.tokens?.idToken ? true : false;
      if (!isAuth) this.router.navigate(['/login']);
    } catch {
      this.router.navigate(['/login']);
    }
  }

  triggerAggregation() {
    this.isLoading = true;
    this.error = '';
    this.result = null;

    const payload: any = {};
    if (this.selectedDate) {
      payload.date = this.selectedDate;
    }

    this.apiService.triggerDailyAggregator(payload).subscribe({
      next: (resp: any) => {
        this.result = resp;
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        console.error('Error triggering daily aggregator:', err);
        console.error('Full error object:', JSON.stringify(err, null, 2));
        
        // Check for CORS error specifically
        if (err?.message?.includes('CORS') || err?.message?.includes('Access-Control-Allow-Origin')) {
          this.error = `CORS Error: The backend API is not allowing requests from this origin. This usually happens when the backend returns an error without CORS headers. Date: ${this.selectedDate || 'auto'}. Please check backend logs.`;
        } else if (err?.status === 0) {
          // Network error or CORS preflight failure
          this.error = `Network/CORS Error: Unable to reach the API. This may be a CORS configuration issue on the backend. Date: ${this.selectedDate || 'auto'}.`;
        } else {
          this.error = err?.error?.detail || err?.error?.message || err?.message || `Failed to trigger daily aggregator. Status: ${err?.status || 'unknown'}`;
        }
        
        this.isLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  clearDate() {
    this.selectedDate = '';
  }

  loadFiles() {
    this.isLoadingFiles = true;
    this.filesError = '';
    this.rowData = [];

    const params: any = {};
    if (this.selectedDateForFiles) {
      params.date = this.selectedDateForFiles;
    }

    this.apiService.getCombinedDataFiles(params).subscribe({
      next: (resp: any) => {
        this.processFilesData(resp);
        this.isLoadingFiles = false;
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        console.error('Error loading combined data files:', err);
        this.filesError = err?.error?.detail || err?.message || 'Failed to load combined data files';
        this.isLoadingFiles = false;
        this.cdr.detectChanges();
      }
    });
  }

  processFilesData(resp: any) {
    console.log('Raw API response:', resp);
    const data = resp?.data || resp || [];
    console.log('Extracted data array:', data);
    const processed: CombinedDataFileRow[] = [];

    data.forEach((item: any) => {
      processed.push({
        date: item.date || '',
        patient: item.patient || 'Unknown',
        shimmer1: item.shimmer1 || '-',
        shimmer2: item.shimmer2 || '-',
        shimmer1_file: item.shimmer1_file || item.shimmer1File || '-',
        shimmer2_file: item.shimmer2_file || item.shimmer2File || '-'
      });
    });

    console.log('Processed data:', processed);
    this.rowData = [...processed];
    
    if (this.gridApi) {
      this.gridApi.setGridOption('rowData', this.rowData);
    }
  }

  onGridReady(event: GridReadyEvent<any>) {
    this.gridApi = event.api;
    this.gridApi.setGridOption('rowHeight', 30);
    
    if (this.rowData && this.rowData.length > 0) {
      this.gridApi.setGridOption('rowData', this.rowData);
    }
  }

  clearDateForFiles() {
    this.selectedDateForFiles = '';
  }

  onLogout() {
    console.log('Logout event received from header component');
  }
}

