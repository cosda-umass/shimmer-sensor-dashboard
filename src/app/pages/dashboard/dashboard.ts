import { Component, OnInit, ViewChild, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { fetchAuthSession } from '@aws-amplify/auth';
import { ApiService } from '../../services/api.service';
import { GridApi, GridReadyEvent, ColDef } from 'ag-grid-community';
import { ChartConfiguration } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';
import { forkJoin } from 'rxjs';

export interface CombinedDataRow {
  date: string;
  patient: string;
  device: string;
  shimmer1: string;
  shimmer2: string;
  shimmer1File: string;
  shimmer2File: string;
  shimmer1AccelPoints?: number;
  shimmer2AccelPoints?: number;
  shimmer1UwbNonZero?: number;
  shimmer2UwbNonZero?: number;
}

@Component({
  selector: 'app-dashboard',
  standalone: false,
  templateUrl: './dashboard.html',
  styleUrls: ['./dashboard.css']
})
export class DashboardPage implements OnInit {
  private gridApi?: GridApi;
  rowData: CombinedDataRow[] = [];
  isLoading = false;
  loadError = '';
  quickFilterText = '';

  // Stats cards properties
  public activeSensors = 0;
  public expectedSensors = 0;
  public usersCount = 0;
  public dataPointsTotal = 0;
  public dataPointsRecentPercent = 0;

  // Modal properties
  selectedRow: CombinedDataRow | null = null;

  // Chart properties
  showChartModal = false;
  chartData: ChartConfiguration<'line'>['data'] = {
    labels: [],
    datasets: [{
      data: [],
      label: 'Accel_WR_Absolute',
      fill: false,
      borderColor: 'rgb(75, 192, 192)',
      tension: 0.4,
      pointRadius: 0,
      pointHoverRadius: 0
    }]
  };
  chartOptions: ChartConfiguration<'line'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { 
        display: true,
        position: 'top'
      },
      tooltip: {
        enabled: true,
        callbacks: {
          title: function() {
            // Don't show time in tooltip
            return '';
          },
          label: function(context: any) {
            // Only show the acceleration value, not the time
            return `${context.dataset.label}: ${context.parsed.y.toFixed(3)} m/s²`;
          }
        }
      }
    },
    scales: {
      x: {
        display: true, // Ensure x-axis is always displayed
        title: { display: true, text: 'Time' },
        type: 'category', // Use category for string labels
        ticks: {
          display: true,
          maxTicksLimit: 20,
          autoSkip: true,
          maxRotation: 45,
          minRotation: 0
        },
        grid: {
          display: true
        }
      },
      y: {
        title: { display: true, text: 'Acceleration (m/s²)' },
        min: 0,
        max: 25,
        beginAtZero: true
      }
    },
    interaction: {
      intersect: false,
      mode: 'index'
    },
    animation: {
      duration: 0 // Disable animation for large datasets
    }
  };
  chartStats = {
    mean: 0,
    max: 0,
    min: 0,
    uwbNonZero: 0,
    accelPoints: 0
  };
  currentChartShimmer: 'shimmer1' | 'shimmer2' = 'shimmer1';
  timelineStart: string | null = null;
  timelineEnd: string | null = null;
  timelineStartFormatted: string = '';
  timelineEndFormatted: string = '';
  fileTimestamps: any[] = [];
  @ViewChild(BaseChartDirective) chart?: BaseChartDirective;

  columnDefs: ColDef[] = [
    { field: 'date', headerName: 'Date', sortable: true, filter: 'agTextColumnFilter', width: 150, flex: 0, suppressSizeToFit: true },
    { field: 'patient', headerName: 'Patient', sortable: true, filter: 'agTextColumnFilter', width: 130, flex: 0, suppressSizeToFit: true },
    { field: 'device', headerName: 'Device', sortable: true, filter: 'agTextColumnFilter', width: 200, flex: 0, suppressSizeToFit: true },
    { field: 'shimmer1', headerName: 'Shimmer1', sortable: true, filter: 'agTextColumnFilter', width: 200, flex: 0, suppressSizeToFit: true },
    { field: 'shimmer2', headerName: 'Shimmer2', sortable: true, filter: 'agTextColumnFilter', width: 200, flex: 0, suppressSizeToFit: true },
    { 
      field: 'shimmer1File', 
      headerName: 'Shimmer1 File', 
      sortable: true, 
      filter: 'agTextColumnFilter',
      hide: true,
      width: 250,
      cellRenderer: (params: any) => {
        if (!params.value || params.value === '-') return '-';
        const fileName = params.value.length > 30 ? params.value.substring(0, 30) + '...' : params.value;
        return `<span title="${params.value}">${fileName}</span>`;
      }
    },
    { 
      field: 'shimmer2File', 
      headerName: 'Shimmer2 File', 
      sortable: true, 
      filter: 'agTextColumnFilter',
      width: 250,
      hide: true,
      cellRenderer: (params: any) => {
        if (!params.value || params.value === '-') return '-';
        const fileName = params.value.length > 30 ? params.value.substring(0, 30) + '...' : params.value;
        return `<span title="${params.value}">${fileName}</span>`;
      }
    },
    {
      headerName: 'Actions',
      flex: 0,
      width: 350,
      suppressSizeToFit: true,
      cellRenderer: (params: any) => {
        const rowData = params.data;
        const dateStr = rowData?.date || '';
        // Convert YYYY-MM-DD to YYYY/MM/DD
        let formattedDate = '';
        if (dateStr) {
          formattedDate = dateStr.replace(/-/g, '/');
        }
        return `
          <div style="display: flex; gap: 0.5rem; align-items: center; justify-content: center; flex-wrap: nowrap;">
            <button 
              class="action-btn view-btn" 
              data-action="view"
              style="
                background-color: hsl(190, 95%, 30%);
                color: white;
                border: 1px solid hsl(190, 95%, 20%);
                border-radius: 0.375rem;
                padding: 0.2rem 0.4rem;
                font-size: 0.7rem;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s;
                display: inline-block;
                text-align: center;
                box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
                white-space: nowrap;
                line-height: 1.2;
              "
              onmouseover="this.style.backgroundColor='hsl(190, 95%, 25%)'; this.style.boxShadow='0 2px 4px rgba(0, 0, 0, 0.15)'; this.style.transform='translateY(-1px)'"
              onmouseout="this.style.backgroundColor='hsl(190, 95%, 30%)'; this.style.boxShadow='0 1px 2px rgba(0, 0, 0, 0.1)'; this.style.transform='translateY(0)'"
              onmousedown="this.style.transform='translateY(0)'; this.style.boxShadow='0 1px 2px rgba(0, 0, 0, 0.1)'"
              onmouseup="this.style.transform='translateY(-1px)'; this.style.boxShadow='0 2px 4px rgba(0, 0, 0, 0.15)'"
            >
              View
            </button>
            <button 
              class="action-btn view-hour-btn" 
              data-action="view-by-hour"
              data-date="${formattedDate}"
              style="
                background-color: hsl(190, 95%, 30%);
                color: white;
                border: 1px solid hsl(190, 95%, 20%);
                border-radius: 0.375rem;
                padding: 0.2rem 0.4rem;
                font-size: 0.7rem;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s;
                display: inline-block;
                text-align: center;
                box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
                white-space: nowrap;
                line-height: 1.2;
              "
              onmouseover="this.style.backgroundColor='hsl(190, 95%, 25%)'; this.style.boxShadow='0 2px 4px rgba(0, 0, 0, 0.15)'; this.style.transform='translateY(-1px)'"
              onmouseout="this.style.backgroundColor='hsl(190, 95%, 30%)'; this.style.boxShadow='0 1px 2px rgba(0, 0, 0, 0.1)'; this.style.transform='translateY(0)'"
              onmousedown="this.style.transform='translateY(0)'; this.style.boxShadow='0 1px 2px rgba(0, 0, 0, 0.1)'"
              onmouseup="this.style.transform='translateY(-1px)'; this.style.boxShadow='0 2px 4px rgba(0, 0, 0, 0.15)'"
            >
              Files by Hour
            </button>
          </div>
        `;
      }
    }
  ];

  defaultColDef: ColDef = {
    flex: 0,
    suppressSizeToFit: true,
    resizable: true,
    sortable: true,
    filter: true
  };

  constructor(private router: Router, private apiService: ApiService, private cdr: ChangeDetectorRef) {}

  async ngOnInit() {
    await this.checkAuth();
    this.loadData();
    this.loadStats();
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

  loadData() {
    this.isLoading = true;
    this.loadError = '';
    
    // Try the new combined-data-files endpoint first, fallback to combined-meta
    this.apiService.getCombinedDataFiles().subscribe({
      next: (resp: any) => {
        this.processData(resp);
        this.isLoading = false;
      },
      error: (err) => {
        console.warn('getCombinedDataFiles failed, trying listFilesCombinedMeta', err);
        // Fallback to existing endpoint
        this.apiService.listFilesCombinedMeta().subscribe({
          next: (resp: any) => {
            this.processData(resp);
            this.isLoading = false;
          },
          error: (err2) => {
            console.error('Failed to load combined data', err2);
            this.loadError = 'Failed to load data. Please try again.';
            this.isLoading = false;
          }
        });
      }
    });
  }

  processData(resp: any) {
    console.log('Raw API response:', resp);
    const data = resp?.data || resp || [];
    console.log('Extracted data array:', data);
    const processed: CombinedDataRow[] = [];

    // Handle the actual API response format:
    // { date, patient, shimmer1, shimmer2, shimmer1_file, shimmer2_file }
    data.forEach((item: any) => {
      // Extract device from filename (e.g., "a9ae0f999916e210_2025-12-11_Shimmer_DCFF_combined.json" -> "a9ae0f999916e210")
      let device = 'Unknown';
      if (item.shimmer1_file) {
        const parts = item.shimmer1_file.split('_');
        if (parts.length > 0) {
          device = parts[0];
        }
      } else if (item.shimmer2_file) {
        const parts = item.shimmer2_file.split('_');
        if (parts.length > 0) {
          device = parts[0];
        }
      }

      // Log the item to see what fields are available
      console.log('Processing item:', item);
      console.log('Item keys:', Object.keys(item));
      
      processed.push({
        date: item.date || '',
        patient: item.patient || 'Unknown',
        device: device,
        shimmer1: item.shimmer1 || '-',
        shimmer2: item.shimmer2 || '-',
        shimmer1File: item.shimmer1_file || item.shimmer1File || '-',
        shimmer2File: item.shimmer2_file || item.shimmer2File || '-',
        shimmer1AccelPoints: item.shimmer1_accel_points || item.shimmer1AccelPoints || 0,
        shimmer2AccelPoints: item.shimmer2_accel_points || item.shimmer2AccelPoints || 0,
        shimmer1UwbNonZero: item.shimmer1_uwb_dis_non_zero_count || item.shimmer1_uwb_dis_non_zero_count || item.shimmer1_uwb_non_zero || item.shimmer1UwbNonZero || 0,
        shimmer2UwbNonZero: item.shimmer2_uwb_dis_non_zero_count || item.shimmer2_uwb_dis_non_zero_count || item.shimmer2_uwb_non_zero || item.shimmer2UwbNonZero || 0
      });
      
      console.log('Processed row UWB counts:', {
        shimmer1: processed[processed.length - 1].shimmer1UwbNonZero,
        shimmer2: processed[processed.length - 1].shimmer2UwbNonZero
      });
    });

    console.log('Processed data:', processed);
    console.log('Sample row:', processed[0]);
    this.rowData = [...processed]; // Create new array reference to trigger change detection
    console.log('rowData set, length:', this.rowData.length);
    
    // If grid is already ready, explicitly update it
    if (this.gridApi) {
      this.gridApi.setGridOption('rowData', this.rowData);
      console.log('Updated grid with rowData:', this.rowData.length, 'rows');
    }
  }

  onGridReady(event: GridReadyEvent<any>) {
    this.gridApi = event.api;
    console.log('Grid ready! rowData length:', this.rowData.length);
    console.log('Grid API:', this.gridApi);
    console.log('Column defs:', this.columnDefs);
    
    // Explicitly set rowData if it's already loaded (handles case where grid initializes before data)
    if (this.rowData && this.rowData.length > 0) {
      this.gridApi.setGridOption('rowData', this.rowData);
      console.log('Explicitly set rowData in grid:', this.rowData.length, 'rows');
      console.log('First row sample:', this.rowData[0]);
    }
    
    // Columns have fixed widths with suppressSizeToFit: true, so no auto-sizing needed
    
    // Handle action button clicks using cellClicked event
    event.api.addEventListener('cellClicked', (e: any) => {
      const target = e.event?.target as HTMLElement;
      // Check if clicked element is a button with action-btn or view-btn class, or if it's inside such a button
      const button = target.closest('.action-btn, .view-btn, .view-hour-btn') as HTMLElement;
      if (button) {
        const action = button.getAttribute('data-action');
        const rowData = e.data as CombinedDataRow;
        
        console.log('Button clicked:', action, 'Row data:', rowData);
        
        if (rowData) {
          if (action === 'view') {
            this.showChart(rowData);
          } else if (action === 'view-by-hour') {
            const dateStr = rowData?.date || '';
            // Convert YYYY-MM-DD to YYYY/MM/DD
            const formattedDate = dateStr ? dateStr.replace(/-/g, '/') : '';
            if (formattedDate) {
              this.router.navigate(['/home'], { queryParams: { filter: formattedDate } });
            }
          }
        }
      }
    });
  }

  exportCSV() {
    if (!this.gridApi) return;
    this.gridApi.exportDataAsCsv({
      fileName: `shimmer-data-${new Date().toISOString().split('T')[0]}.csv`
    });
  }

  showChart(row: CombinedDataRow) {
    this.selectedRow = row;
    // Default to shimmer1 if available, otherwise shimmer2
    this.currentChartShimmer = row.shimmer1 !== '-' ? 'shimmer1' : 'shimmer2';
    const filename = this.currentChartShimmer === 'shimmer1' 
      ? (row.shimmer1File !== '-' ? row.shimmer1File : null)
      : (row.shimmer2File !== '-' ? row.shimmer2File : null);
    
    if (filename && filename !== '-') {
      this.loadChartData(filename, 'accel_wr_absolute_downsampled');
    } else {
      // Show modal even if no data, with empty stats
      this.showChartModal = true;
    }
  }

  loadChartData(filename: string, fieldName: string) {
    this.isLoading = true;
    
    // Get UWB count from the row data first (already loaded)
    const uwbCountFromRow = this.currentChartShimmer === 'shimmer1' 
      ? (this.selectedRow?.shimmer1UwbNonZero || 0)
      : (this.selectedRow?.shimmer2UwbNonZero || 0);
    
    // Load file data which now contains both acceleration data and file metadata
    this.apiService.getCombinedDataFile(filename).subscribe({
      next: (response: any) => {
        // The actual data is nested in response.data
        const fileData = response?.data || response || {};
        
        console.log('Response structure:', response);
        console.log('Extracted fileData:', fileData);
        console.log('fileData.accel_wr_absolute_downsampled:', fileData?.accel_wr_absolute_downsampled?.length || 0);
        console.log('fileData.file_timestamps:', fileData?.file_timestamps?.length || 0);
        
        // Extract data from the new structure
        const values = fileData?.accel_wr_absolute_downsampled || [];
        this.fileTimestamps = fileData?.file_timestamps || [];
        
        // Extract timeline information directly from JSON timestamp field (same as x-axis)
        if (this.fileTimestamps.length > 0) {
          // Use timestamp from JSON file directly - same as what's used for x-axis
          const firstFile = this.fileTimestamps[0];
          this.timelineStart = firstFile.timestamp || null;
          
          // Format start time same way as x-axis (HH:MM:SS from UTC)
          if (this.timelineStart) {
            const startDate = new Date(this.timelineStart);
            const hours = startDate.getUTCHours().toString().padStart(2, '0');
            const minutes = startDate.getUTCMinutes().toString().padStart(2, '0');
            const seconds = startDate.getUTCSeconds().toString().padStart(2, '0');
            this.timelineStartFormatted = `${hours}:${minutes}:${seconds}`;
          }
          
          // Calculate timeline_end from last file's timestamp + 1 hour (only calculation)
          const lastFile = this.fileTimestamps[this.fileTimestamps.length - 1];
          const lastFileStart = new Date(lastFile.timestamp).getTime();
          
          // Add 1 hour to the last file's timestamp
          const oneHourInMs = 60 * 60 * 1000; // 1 hour in milliseconds
          const lastFileEnd = new Date(lastFileStart + oneHourInMs);
          this.timelineEnd = lastFileEnd.toISOString();
          
          // Format end time same way as x-axis (HH:MM:SS from UTC)
          if (this.timelineEnd) {
            const endDate = new Date(this.timelineEnd);
            const hours = endDate.getUTCHours().toString().padStart(2, '0');
            const minutes = endDate.getUTCMinutes().toString().padStart(2, '0');
            const seconds = endDate.getUTCSeconds().toString().padStart(2, '0');
            this.timelineEndFormatted = `${hours}:${minutes}:${seconds}`;
          }
        } else {
          this.timelineStart = null;
          this.timelineEnd = null;
          this.timelineStartFormatted = '';
          this.timelineEndFormatted = '';
        }
        
        // Generate time-based labels from file_timestamps
        // Use downsampled_start_index and downsampled_end_index for accurate mapping
        let labels: string[] = [];
        
        if (this.fileTimestamps.length > 0 && values.length > 0) {
          // Downsampling ratio: 50 original samples = 1 downsampled point
          const DOWNSAMPLE_RATIO = 50;
          // Estimated sample rate (Hz) - typically 51.2 Hz for Shimmer sensors
          const SAMPLE_RATE = 51.2;
          // Time per original sample (seconds)
          const TIME_PER_SAMPLE = 1 / SAMPLE_RATE;
          // Time per downsampled point (seconds) = 50 samples * time per sample
          const TIME_PER_DOWNSAMPLED_POINT = DOWNSAMPLE_RATIO * TIME_PER_SAMPLE;
          
          // Initialize labels array with the correct size
          labels = new Array(values.length);
          
          // Calculate timestamps for each downsampled point based on file boundaries
          for (let fileIdx = 0; fileIdx < this.fileTimestamps.length; fileIdx++) {
            const file = this.fileTimestamps[fileIdx];
            const fileStartTime = new Date(file.timestamp).getTime();
            
            // Use provided indices if available, otherwise calculate
            const startIndex = file.downsampled_start_index !== undefined 
              ? file.downsampled_start_index 
              : (fileIdx === 0 ? 0 : this.fileTimestamps[fileIdx - 1].downsampled_end_index + 1);
            
            const endIndex = file.downsampled_end_index !== undefined
              ? file.downsampled_end_index
              : startIndex + (file.downsampled_samples || Math.ceil(file.accel_samples / DOWNSAMPLE_RATIO)) - 1;
            
            const downsampledPointsInFile = endIndex - startIndex + 1;
            
            console.log(`File ${fileIdx + 1}: ${file.filename}`);
            console.log(`  Start time: ${file.timestamp}`);
            console.log(`  Original samples: ${file.accel_samples}`);
            console.log(`  Downsampled indices: ${startIndex} to ${endIndex} (${downsampledPointsInFile} points)`);
            console.log(`  Time per downsampled point: ${TIME_PER_DOWNSAMPLED_POINT.toFixed(3)}s`);
            
            // Generate labels for this file's downsampled points
            for (let i = 0; i < downsampledPointsInFile; i++) {
              const globalIndex = startIndex + i;
              
              // Only process if within bounds
              if (globalIndex >= 0 && globalIndex < values.length) {
                // Calculate time offset: i * time per downsampled point
                const timeOffsetSeconds = i * TIME_PER_DOWNSAMPLED_POINT;
                const timeOffsetMs = timeOffsetSeconds * 1000;
                const sampleTime = new Date(fileStartTime + timeOffsetMs);
                
                // Format as HH:MM:SS using UTC (since timestamp from JSON is in UTC)
                const hours = sampleTime.getUTCHours().toString().padStart(2, '0');
                const minutes = sampleTime.getUTCMinutes().toString().padStart(2, '0');
                const seconds = sampleTime.getUTCSeconds().toString().padStart(2, '0');
                labels[globalIndex] = `${hours}:${minutes}:${seconds}`;
              }
            }
            
            // Log the time range for this file
            if (downsampledPointsInFile > 0) {
              const fileEndTime = new Date(fileStartTime + (downsampledPointsInFile - 1) * TIME_PER_DOWNSAMPLED_POINT * 1000);
              console.log(`  End time: ${fileEndTime.toISOString()}`);
            }
          }
          
          // Fill any missing labels (shouldn't happen, but safety check)
          for (let i = 0; i < labels.length; i++) {
            if (!labels[i]) {
              // Use previous label or default
              labels[i] = i > 0 ? labels[i - 1] : '00:00:00';
            }
          }
          
          console.log(`Total labels generated: ${labels.length}, Total values: ${values.length}`);
        } else if (values.length > 0) {
          // Fallback: Use sample indices if no file_timestamps
          labels = Array.from({ length: values.length }, (_, i) => i.toString());
        }
        
        // Create a new chart data object to trigger change detection
        // Ensure we have valid data
        if (labels.length === 0 || values.length === 0) {
          console.error('No labels or values to display!', {
            labelsLength: labels.length,
            valuesLength: values.length
          });
        }
        
        // Display all data points as-is (no downsampling)
        let displayLabels = labels;
        let displayValues = values;
        
        // Ensure data is in correct format for Chart.js
        // Chart.js expects numbers, not strings
        const numericValues = displayValues.map((v: any) => {
          const num = parseFloat(v);
          return isNaN(num) ? 0 : num;
        });
        
        this.chartData = {
          labels: displayLabels,
          datasets: [{
            data: numericValues,
            label: 'Accel_WR_Absolute',
            fill: false,
            borderColor: 'rgb(75, 192, 192)',
            backgroundColor: 'rgb(75, 192, 192)',
            tension: 0.4,
            pointRadius: 0,
            pointHoverRadius: 0,
            borderWidth: 1,
            spanGaps: false
          }]
        };
        
        // Log to verify data format
        console.log('Chart data prepared:', {
          labelsType: typeof displayLabels[0],
          dataType: typeof numericValues[0],
          hasData: numericValues.length > 0,
          dataRange: numericValues.length > 0 ? {
            min: Math.min(...numericValues),
            max: Math.max(...numericValues)
          } : null
        });
        
        console.log('Chart data set:', {
          labelsCount: this.chartData.labels?.length || 0,
          dataCount: this.chartData.datasets?.[0]?.data?.length || 0,
          firstLabel: this.chartData.labels?.[0],
          lastLabel: this.chartData.labels?.[this.chartData.labels.length - 1],
          firstValue: this.chartData.datasets?.[0]?.data?.[0],
          lastValue: this.chartData.datasets?.[0]?.data?.[this.chartData.datasets[0].data.length - 1],
          sampleValues: this.chartData.datasets?.[0]?.data?.slice(0, 5),
          chartDataStructure: JSON.stringify({
            labels: this.chartData.labels?.slice(0, 3),
            datasets: [{
              data: this.chartData.datasets?.[0]?.data?.slice(0, 3),
              label: this.chartData.datasets?.[0]?.label
            }]
          })
        });
        
        // Update x-axis configuration if we have timeline data
        const currentScales = this.chartOptions?.scales || {};
        const currentXScale = (currentScales as any)?.['x'] || {};
        
        // Use time labels if we have file_timestamps, otherwise fallback
        if (this.fileTimestamps.length > 0 && displayLabels.length > 0) {
          // Extract file start times directly from JSON timestamp field (no calculations)
          const fileStartTimes: string[] = [];
          const fileStartIndices: number[] = [];
          
          this.fileTimestamps.forEach((file, idx) => {
            const startIndex = file.downsampled_start_index !== undefined 
              ? file.downsampled_start_index 
              : (idx === 0 ? 0 : this.fileTimestamps[idx - 1].downsampled_end_index + 1);
            
            // Format the timestamp directly from JSON file (no filename parsing)
            const fileDate = new Date(file.timestamp);
            const hours = fileDate.getUTCHours().toString().padStart(2, '0');
            const minutes = fileDate.getUTCMinutes().toString().padStart(2, '0');
            const seconds = fileDate.getUTCSeconds().toString().padStart(2, '0');
            const formattedTime = `${hours}:${minutes}:${seconds}`;
            
            fileStartTimes.push(formattedTime);
            fileStartIndices.push(startIndex);
          });
          
          // Store for callback access
          const fileStartTimesForDisplay = fileStartTimes;
          const fileStartIndicesForTicks = fileStartIndices;
          
          this.chartOptions = {
            ...this.chartOptions,
            scales: {
              ...currentScales,
              x: {
                type: 'category', // CRITICAL: Use category for string labels
                display: true, // Ensure x-axis is displayed
                title: { 
                  display: true, 
                  text: 'Time',
                  font: { size: 12 }
                },
                ticks: {
                  display: true, // Ensure ticks are displayed
                  // Only show file start times, no intermediate labels
                  callback: (value: any, index: number, ticks: any[]) => {
                    // Check if this index is a file start index
                    if (fileStartIndicesForTicks.includes(index)) {
                      // Return the formatted file start time
                      const fileIdx = fileStartIndicesForTicks.indexOf(index);
                      return fileStartTimesForDisplay[fileIdx] || value;
                    }
                    // Don't show any other labels - only file start times
                    return undefined;
                  },
                  maxTicksLimit: this.fileTimestamps.length + 2, // Only show file starts
                  autoSkip: false, // We control which labels to show
                  maxRotation: 45,
                  minRotation: 0,
                  font: { size: 11 },
                  color: '#000000',
                  padding: 8
                },
                grid: {
                  display: true,
                  drawOnChartArea: true
                }
              }
            }
          };
        } else if (this.timelineStart && this.timelineEnd) {
          // Fallback to timeline_start/end
          this.chartOptions = {
            ...this.chartOptions,
            scales: {
              ...currentScales,
              x: {
                ...currentXScale,
                title: { display: true, text: 'Time' }
              }
            }
          };
        } else {
          // Reset to sample index if no timeline data
          this.chartOptions = {
            ...this.chartOptions,
            scales: {
              ...currentScales,
              x: {
                ...currentXScale,
                title: { display: true, text: 'Sample Index' }
              }
            }
          };
        }

        // Try to get UWB count from file data as fallback, but prefer row data
        console.log('Full response:', response);
        console.log('File data:', fileData);
        console.log('File data keys:', Object.keys(fileData || {}));
        
        // Get UWB count from file data (now directly available)
        const uwbCountFromFile = fileData?.uwb_dis_non_zero_count || 0;
        const uwbCount = uwbCountFromRow > 0 ? uwbCountFromRow : uwbCountFromFile;
        const accelPoints = values.length || 0;
        
        console.log('UWB count from row:', uwbCountFromRow);
        console.log('UWB count from file:', uwbCountFromFile);
        console.log('UWB count final:', uwbCount);
        console.log('Labels count:', labels.length);
        console.log('Values count:', values.length);
        console.log('File timestamps:', this.fileTimestamps.length);
        
        // Calculate statistics
        if (values.length > 0) {
          const numericValues = values.map((v: any) => parseFloat(v)).filter((v: any) => !isNaN(v));
          this.chartStats = {
            mean: numericValues.reduce((a: number, b: number) => a + b, 0) / numericValues.length,
            max: Math.max(...numericValues),
            min: Math.min(...numericValues),
            uwbNonZero: uwbCount,
            accelPoints: accelPoints
          };
        } else {
          this.chartStats = {
            mean: 0,
            max: 0,
            min: 0,
            uwbNonZero: uwbCount,
            accelPoints: accelPoints
          };
        }

        this.isLoading = false;
        
        // Show modal first
        this.showChartModal = true;
        this.cdr.detectChanges();
        
        // Force chart update after Angular has rendered
        setTimeout(() => {
          this.cdr.detectChanges();
          if (this.chart) {
            try {
              // Force chart to re-render with new data
              this.chart.update('none'); // 'none' mode for instant update
              // Also try render to force redraw
              this.chart.render();
              console.log('Chart updated and rendered successfully');
            } catch (error) {
              console.error('Error updating chart:', error);
            }
          } else {
            console.warn('Chart reference not available, will retry...');
            // Retry after longer delay
            setTimeout(() => {
              this.cdr.detectChanges();
              if (this.chart) {
                this.chart.update('none');
                this.chart.render();
                console.log('Chart updated on retry');
              } else {
                console.error('Chart reference still not available after retry');
              }
            }, 500);
          }
        }, 200);
      },
      error: (err: any) => {
        console.error('Failed to load chart data', err);
        alert('Failed to load chart data. Please try again.');
        this.isLoading = false;
      }
    });
  }

  formatFileTimestamp(timestamp: string): string {
    if (!timestamp) return '';
    // Format timestamp same way as x-axis (HH:MM:SS from UTC)
    const date = new Date(timestamp);
    const hours = date.getUTCHours().toString().padStart(2, '0');
    const minutes = date.getUTCMinutes().toString().padStart(2, '0');
    const seconds = date.getUTCSeconds().toString().padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  }

  closeChartModal() {
    this.showChartModal = false;
    this.timelineStart = null;
    this.timelineEnd = null;
    this.timelineStartFormatted = '';
    this.timelineEndFormatted = '';
    this.fileTimestamps = [];
  }

  downloadFile() {
    if (!this.selectedRow) return;
    
    const filename = this.currentChartShimmer === 'shimmer1' 
      ? (this.selectedRow.shimmer1File !== '-' ? this.selectedRow.shimmer1File : null)
      : (this.selectedRow.shimmer2File !== '-' ? this.selectedRow.shimmer2File : null);
    
    if (!filename || filename === '-') {
      alert('No file available for download');
      return;
    }

    // Get the file data and trigger download
    this.apiService.getCombinedDataFile(filename).subscribe({
      next: (fileData: any) => {
        // Create a blob and download
        const jsonStr = JSON.stringify(fileData, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      },
      error: (err) => {
        console.error('Failed to download file', err);
        alert('Failed to download file. Please try again.');
      }
    });
  }

  toggleShimmer(shimmer: 'shimmer1' | 'shimmer2') {
    if (!this.selectedRow) return;
    this.currentChartShimmer = shimmer;
    const filename = shimmer === 'shimmer1' 
      ? (this.selectedRow.shimmer1File !== '-' ? this.selectedRow.shimmer1File : null)
      : (this.selectedRow.shimmer2File !== '-' ? this.selectedRow.shimmer2File : null);
    
    if (filename) {
      this.loadChartData(filename, 'accel_wr_absolute_downsampled');
    }
  }

  exportChart() {
    if (!this.chart) return;
    const canvas = this.chart.chart?.canvas;
    if (canvas) {
      const url = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = url;
      link.download = `shimmer-chart-${this.selectedRow?.date}-${this.currentChartShimmer}.png`;
      link.click();
    }
  }

  onLogout() {
    this.router.navigate(['/login']);
  }

  loadStats() {
    // Load users count - same as home-page
    this.apiService.listUniquePatients().subscribe({
      next: (patients: any[]) => {
        this.usersCount = Array.isArray(patients) ? patients.length : 0;
      },
      error: () => { this.usersCount = 0; }
    });

    // Load active sensors - same as home-page
    this.apiService.ddbGetDevicePatientMapDetails().subscribe((shimmerRecords) => {
      this.apiService.listFilesDeconstructed().subscribe((files) => {
        const allShimmersSet = new Set<string>();
        shimmerRecords.forEach(rec => {
          if (rec.shimmer1 && Array.isArray(rec.shimmer1)) {
            rec.shimmer1.forEach(shimmer => allShimmersSet.add(shimmer));
          }
          if (rec.shimmer2 && Array.isArray(rec.shimmer2)) {
            rec.shimmer2.forEach(shimmer => allShimmersSet.add(shimmer));
          }
        });

        // Support both array and {data: array, error: null} response
        let fileList: any[] = [];
        if (Array.isArray(files)) {
          fileList = files;
        } else if (files && Array.isArray(files.data)) {
          fileList = files.data;
        } else {
          console.error('Expected files to be an array or {data: array}, got:', files);
          return;
        }

        const now = new Date();
        const activeShimmers = new Set<string>();

        fileList.forEach((file: any) => {
          if (file.shimmer_device && file.date && file.time) {
            // Combine date and time for accurate recency check
            const fileDateTimeStr = `${file.date}T${file.time}`;
            const fileDate = new Date(fileDateTimeStr);
            const diff = (now.getTime() - fileDate.getTime()) / (1000 * 60 * 60 * 24);
            if (diff <= 2) {
              activeShimmers.add(file.shimmer_device);
            }
          }
        });

        // Set the public property to the number of active shimmers
        this.activeSensors = activeShimmers.size;

        // allShimmers = all known shimmers
        // activeShimmers = shimmers with files in last 2 days
        this.expectedSensors = allShimmersSet.size;
        this.cdr.detectChanges();
      });
    });

    // Load data points stats - same as home-page
    const now = new Date();
    const cutoff = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
    this.apiService.listFilesMetadata().subscribe({
      next: (response: any) => {
        const items = Array.isArray(response?.data) ? response.data : [];
        console.log('Files data:', items.slice(0, 2)); // Debug: log first 2 items
        
        // Count all individual files, not just rows, excluding files with "_decode" in name
        let allFiles: any[] = [];
        items.forEach((row: any) => {
          const rowFiles = row?.files;
          if (rowFiles && Array.isArray(rowFiles)) {
            // Filter out files with "_decode" in the name
            const filteredFiles = rowFiles.filter((file: any) => {
              const fileName = file?.fullname || file?.name || '';
              return !fileName.includes('_decode');
            });
            allFiles = allFiles.concat(filteredFiles);
          }
        });
        
        console.log(`Total individual files found (excluding _decode): ${allFiles.length}`);
        
        this.dataPointsTotal = allFiles.length;
        
        const recent = allFiles.filter(f => {
          // Extract date from timestamp format: 20250827_013909 or 20250904_003502
          const timestamp = f?.timestamp || '';
          
          if (!timestamp || timestamp === 'files.zip') return false;
          
          // Parse timestamp YYYYMMDD_HHMMSS
          const dateMatch = timestamp.match(/^(\d{4})(\d{2})(\d{2})_/);
          if (!dateMatch) return false;
          
          const year = parseInt(dateMatch[1]);
          const month = parseInt(dateMatch[2]) - 1; // months are 0-based
          const day = parseInt(dateMatch[3]);
          const dt = new Date(year, month, day);
          
          return !isNaN(dt.getTime()) && dt >= cutoff;
        }).length;
        
        this.dataPointsRecentPercent = this.dataPointsTotal ? Math.round((recent / this.dataPointsTotal) * 100) : 0;
        console.log(`Total files: ${this.dataPointsTotal}, Recent files: ${recent}, Percent: ${this.dataPointsRecentPercent}`);
      },
      error: () => { this.dataPointsTotal = 0; this.dataPointsRecentPercent = 0; }
    });
  }
}

