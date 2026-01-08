// ...existing imports...
import Chart from 'chart.js/auto';
import { ColDef, ColGroupDef } from 'ag-grid-community';
import { ApiService } from '../../services/api.service';
import { Component, OnInit, OnChanges, SimpleChanges, Input, Output, EventEmitter } from '@angular/core';
import { forkJoin } from 'rxjs';

@Component({
  selector: 'app-data-grid',
  standalone: false,
  templateUrl: './data-grid.html',
  styleUrl: './data-grid.css'
})
export class DataGrid implements OnInit, OnChanges {
  // ...existing code...

  showToast(message: string) {
    const toast = document.getElementById('toast');
    const msg = document.getElementById('toast-message');
    if (!toast || !msg) return;
    msg.textContent = message;
    toast.classList.remove('hidden');
    toast.style.opacity = '1';
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.classList.add('hidden'), 300);
    }, 2500);
  }
  @Output() graphOutput = new EventEmitter<{ time?: any[]; abs?: any[]; noDownsample?: boolean }>();
  private chartInstance: Chart | null = null;

  private destroyChart() {
    if (this.chartInstance) {
      this.chartInstance.destroy();
      this.chartInstance = null;
    }
  }
  // Modal state for graph plotting
  // Modal/chart logic removed; modal now handled by parent component
  rowData: any[] = [];
  columnDefs: (ColDef | ColGroupDef)[] = [
  { headerName: 'Patient', field: 'patient', filter: 'agTextColumnFilter', sortable: true, minWidth: 120, maxWidth: 160 },
  { headerName: 'Device', field: 'device', filter: 'agTextColumnFilter', sortable: true, minWidth: 120, maxWidth: 160, hide: true },
  { headerName: 'Synced Date ', field: 'date', filter: 'agDateColumnFilter', sortable: true, minWidth: 120, maxWidth: 140 },
    {
      headerName: 'Left Hand Device',
      groupId: 'shimmer1',
      children: [
        { headerName: 'Recorded Time (GMT)', field: 'shimmer1_recorded_timestamp', filter: 'agTextColumnFilter', sortable: true, minWidth: 180, maxWidth: 220 },
        { headerName: 'Day', field: 'shimmer1_shimmer_day', filter: 'agTextColumnFilter', sortable: true, minWidth: 80, maxWidth: 100, hide: true},
        { headerName: 'Accel Var', field: 'shimmer1_accel_var', filter: 'agNumberColumnFilter', sortable: true, minWidth: 110, maxWidth: 130, hide: true },
        // { headerName: 'Time', field: 'shimmer1_time', filter: 'agTextColumnFilter', sortable: true, minWidth: 100, maxWidth: 120 },
        { headerName: 'Full File Name', field: 'shimmer1_full_file_name', filter: 'agTextColumnFilter', sortable: true, minWidth: 220, maxWidth: 320, hide: true },
        { headerName: 'MAC Address', field: 'shimmer1_mac_address', filter: 'agTextColumnFilter', sortable: true, minWidth: 140, maxWidth: 180 },
        {
          headerName: '',
          field: 'shimmer1_graph',
          cellRenderer: (params: any) => {
            const fullFileName = params.data.shimmer1_full_file_name;
            if (!fullFileName) return '';
            const btn = document.createElement('button');
            btn.className = 'ag-btn ag-btn-graph themed-graph-btn';
            btn.title = 'Show Graph';
            btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><polyline points="6 17 9 13 13 17 18 10"/></svg>`;
            btn.onclick = () => {
              btn.disabled = true;
              btn.style.opacity = '0.5';
              forkJoin({
                time: this.apiService.getDecodedFieldDirect(fullFileName, 'timestampCal'),
                abs: this.apiService.getDecodedFieldDirect(fullFileName, 'Accel_WR_Absolute')
              }).subscribe({
                next: (result) => {
                  console.log('API Response for Shimmer 1:', result);
                  console.log('Time data:', result.time);
                  console.log('Abs data:', result.abs);
                  
                  // Send raw data - downsampling will be handled in the modal
                  this.graphOutput.emit({
                    time: result.time?.values || [],
                    abs: result.abs?.values || []
                  });
                  btn.disabled = false;
                  btn.style.opacity = '1';
                },
                error: (err) => {
                  console.error('Error fetching graph data:', err);
                  btn.disabled = false;
                  btn.style.opacity = '1';
                  alert('Failed to load graph data');
                }
              });
            };
            return btn;
          },
          minWidth: 40, maxWidth: 60
        },
        {
          headerName: '',
          field: 'shimmer1_uwb_graph',
          cellRenderer: (params: any) => {
            const fullFileName = params.data.shimmer1_full_file_name;
            if (!fullFileName) return '';
            const btn = document.createElement('button');
            btn.className = 'ag-btn ag-btn-uwb themed-graph-btn';
            btn.title = 'Show UWB Distance Graph';
            btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12H3"/><path d="m8 8-4 4 4 4"/><path d="m16 16 4-4-4-4"/></svg>`;
            btn.onclick = () => {
              btn.disabled = true;
              btn.style.opacity = '0.5';
              forkJoin({
                time: this.apiService.getDecodedFieldDirect(fullFileName, 'timestampCal'),
                uwbDis: this.apiService.getDecodedFieldDirect(fullFileName, 'uwbDis')
              }).subscribe({
                next: (result) => {
                  console.log('UWB API Response for Shimmer 1:', result);
                  console.log('Time data:', result.time);
                  console.log('UWB Distance data:', result.uwbDis);
                  // Decouple emission to prevent recursion
                  setTimeout(() => {
                    this.graphOutput.emit({
                      time: result.time?.values || [],
                      abs: result.uwbDis?.values || [],
                      noDownsample: true
                    });
                    btn.disabled = false;
                    btn.style.opacity = '1';
                  }, 0);
                },
                error: (err) => {
                  console.error('Error fetching UWB graph data:', err);
                  btn.disabled = false;
                  btn.style.opacity = '1';
                  alert('Failed to load UWB graph data');
                }
              });
            };
            return btn;
          },
          minWidth: 40, maxWidth: 60
        },
        {
          headerName: '',
          field: 'shimmer1_show_file',
          minWidth: 40,
          maxWidth: 60,
          cellRenderer: (params: any) => {
            const fullFileName = params.data.shimmer1_full_file_name;
            if (!fullFileName) return '';

            const btn = document.createElement('button');
            btn.className = 'ag-btn ag-btn-action themed-action-btn';
            btn.title = 'Show Shimmer 1 File Name';
            btn.innerHTML = `
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"
              viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2"
              stroke-linecap="round" stroke-linejoin="round">
                <circle cx="11" cy="11" r="8"/>
                <line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>`;

            btn.onclick = () => {
              this.showToast('Shimmer 1 File:\n' + fullFileName);
            };

            return btn;
          }
        },
      ]
    },
    {
      headerName: 'Right Hand Device',
      groupId: 'shimmer2',
      children: [
        { headerName: 'Recorded Time (GMT)', field: 'shimmer2_recorded_timestamp', filter: 'agTextColumnFilter', sortable: true, minWidth: 180, maxWidth: 220 },
        { headerName: 'Day', field: 'shimmer2_shimmer_day', filter: 'agTextColumnFilter', sortable: true, minWidth: 80, maxWidth: 100 , hide: true},
        { headerName: 'Accel Var', field: 'shimmer2_accel_var', filter: 'agNumberColumnFilter', sortable: true, minWidth: 110, maxWidth: 130, hide: true },
        // { headerName: 'Time', field: 'shimmer2_time', filter: 'agTextColumnFilter', sortable: true, minWidth: 100, maxWidth: 120 },
        { headerName: 'Full File Name', field: 'shimmer2_full_file_name', filter: 'agTextColumnFilter', sortable: true, minWidth: 220, maxWidth: 320, hide: true },
        { headerName: 'MAC Address', field: 'shimmer2_mac_address', filter: 'agTextColumnFilter', sortable: true, minWidth: 140, maxWidth: 180 },
        {
          headerName: '',
          field: 'shimmer2_graph',
          cellRenderer: (params: any) => {
            const fullFileName = params.data.shimmer2_full_file_name;
            if (!fullFileName) return '';
            const btn = document.createElement('button');
            btn.className = 'ag-btn ag-btn-graph themed-graph-btn';
            btn.title = 'Show Graph';
            btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><polyline points="6 17 9 13 13 17 18 10"/></svg>`;
            btn.onclick = () => {
              btn.disabled = true;
              btn.style.opacity = '0.5';
              forkJoin({
                time: this.apiService.getDecodedFieldDirect(fullFileName, 'timestampCal'),
                abs: this.apiService.getDecodedFieldDirect(fullFileName, 'Accel_WR_Absolute')
              }).subscribe({
                next: (result) => {
                  console.log('API Response for Shimmer 2:', result);
                  console.log('Time data:', result.time);
                  console.log('Abs data:', result.abs);
                  
                  // Send raw data - downsampling will be handled in the modal
                  this.graphOutput.emit({
                    time: result.time?.values || [],
                    abs: result.abs?.values || []
                  });
                  btn.disabled = false;
                  btn.style.opacity = '1';
                },
                error: (err) => {
                  console.error('Error fetching graph data:', err);
                  btn.disabled = false;
                  btn.style.opacity = '1';
                  alert('Failed to load graph data');
                }
              });
            };
            return btn;
          },
          minWidth: 40, maxWidth: 60
        },
        {
          headerName: '',
          field: 'shimmer2_uwb_graph',
          cellRenderer: (params: any) => {
            const fullFileName = params.data.shimmer2_full_file_name;
            if (!fullFileName) return '';
            const btn = document.createElement('button');
            btn.className = 'ag-btn ag-btn-uwb themed-graph-btn';
            btn.title = 'Show UWB Distance Graph';
            btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12H3"/><path d="m8 8-4 4 4 4"/><path d="m16 16 4-4-4-4"/></svg>`;
            btn.onclick = () => {
              btn.disabled = true;
              btn.style.opacity = '0.5';
              forkJoin({
                time: this.apiService.getDecodedFieldDirect(fullFileName, 'timestampCal'),
                uwbDis: this.apiService.getDecodedFieldDirect(fullFileName, 'uwbDis')
              }).subscribe({
                next: (result) => {
                  console.log('UWB API Response for Shimmer 2:', result);
                  console.log('Time data:', result.time);
                  console.log('UWB Distance data:', result.uwbDis);
                  // Decouple emission to prevent recursion
                  setTimeout(() => {
                    this.graphOutput.emit({
                      time: result.time?.values || [],
                      abs: result.uwbDis?.values || [],
                      noDownsample: true
                    });
                    btn.disabled = false;
                    btn.style.opacity = '1';
                  }, 0);
                },
                error: (err) => {
                  console.error('Error fetching UWB graph data:', err);
                  btn.disabled = false;
                  btn.style.opacity = '1';
                  alert('Failed to load UWB graph data');
                }
              });
            };
            return btn;
          },
          minWidth: 40, maxWidth: 60
        },
        {
          headerName: '',
          field: 'shimmer2_show_file',
          minWidth: 40,
          maxWidth: 60,
          cellRenderer: (params: any) => {
            const fullFileName = params.data.shimmer2_full_file_name;
            if (!fullFileName) return '';

            const btn = document.createElement('button');
            btn.className = 'ag-btn ag-btn-action themed-action-btn';
            btn.title = 'Show Shimmer 2 File Name';
            btn.innerHTML = `
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"
              viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2"
              stroke-linecap="round" stroke-linejoin="round">
                <circle cx="11" cy="11" r="8"/>
                <line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>`;

            btn.onclick = () => {
              this.showToast('Shimmer 2 File:\n' + fullFileName);
            };

            return btn;
          }
        },
      ],
    }
  ];


  @Input() initialFilter: string = '';
  quickFilterText: string = '';
  isLoading: boolean = true;

  constructor(private apiService: ApiService) {}

  formatRecordedTimestamp(timestamp: string): string {
    if (!timestamp) return '';
    // Format as readable date-time: YYYY/MM/DD HH:MM:SS (UTC)
    // timestampCal is ISO 8601 with UTC timezone (+00:00), so we display UTC time as-is
    // No timezone conversion - both timestampCal and timestamp are in UTC
    const date = new Date(timestamp);
    const year = date.getUTCFullYear();
    const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
    const day = date.getUTCDate().toString().padStart(2, '0');
    const hours = date.getUTCHours().toString().padStart(2, '0');
    const minutes = date.getUTCMinutes().toString().padStart(2, '0');
    const seconds = date.getUTCSeconds().toString().padStart(2, '0');
    return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;
  }

  ngOnInit(): void {
    // Set initial filter from input if provided
    if (this.initialFilter) {
      this.quickFilterText = this.initialFilter;
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Update quickFilterText when initialFilter input changes
    if (changes['initialFilter'] && changes['initialFilter'].currentValue) {
      this.quickFilterText = changes['initialFilter'].currentValue;
    }
    this.apiService.listFilesCombinedMeta().subscribe((resp: any) => {
      if (resp && Array.isArray(resp.data)) {
        this.rowData = resp.data.flatMap((item: any) => {
          const shimmer1Arr = item.shimmer1_decoded || [];
          const shimmer2Arr = item.shimmer2_decoded || [];
          const maxLen = Math.max(shimmer1Arr.length, shimmer2Arr.length);
          const rows = [];
          for (let i = 0; i < maxLen; i++) {
            const s1 = shimmer1Arr[i] || {};
            const s2 = shimmer2Arr[i] || {};
            rows.push({
              patient: item.patient,
              device: item.device,
              date: item.date,
              shimmer1: item.shimmer1,
              shimmer2: item.shimmer2,
              // Shimmer 1 fields
              shimmer1_recorded_timestamp: s1.recordedTimestamp ? this.formatRecordedTimestamp(s1.recordedTimestamp) : null,
              shimmer1_time: s1.time,
              shimmer1_full_file_name: s1.full_file_name,
              shimmer1_mac_address: s1.macAddress,
              shimmer1_experiment_name: s1.experiment_name,
              shimmer1_shimmer_device: s1.shimmer_device,
              shimmer1_filename: s1.filename,
              shimmer1_shimmer_day: s1.shimmer_day,
              shimmer1_part: s1.part,
              shimmer1_accel_var: s1.Accel_WR_VAR ? parseFloat(Number(s1.Accel_WR_VAR).toFixed(4)) : null,
              // Shimmer 2 fields
              shimmer2_recorded_timestamp: s2.recordedTimestamp ? this.formatRecordedTimestamp(s2.recordedTimestamp) : null,
              shimmer2_time: s2.time,
              shimmer2_full_file_name: s2.full_file_name,
              shimmer2_mac_address: s2.macAddress,
              shimmer2_experiment_name: s2.experiment_name,
              shimmer2_shimmer_device: s2.shimmer_device,
              shimmer2_filename: s2.filename,
              shimmer2_shimmer_day: s2.shimmer_day,
              shimmer2_part: s2.part,
              shimmer2_accel_var: s2.Accel_WR_VAR ? parseFloat(Number(s2.Accel_WR_VAR).toFixed(4)) : null
            });
          }
          return rows;
        });
      }
      this.isLoading = false;
    }, () => {
      this.isLoading = false;
    });
  }

  gridOptions: any;
}

