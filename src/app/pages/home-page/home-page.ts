import { Component, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { fetchAuthSession } from '@aws-amplify/auth';
import { ApiService, FileItem } from '../../services/api.service';
import { Observable } from 'rxjs';
import { ChangeDetectorRef } from '@angular/core';
import { ChartConfiguration } from 'chart.js';

@Component({
  selector: 'app-home-page',
  standalone: false,
  templateUrl: './home-page.html',
  styleUrls: ['./home-page.css']
})
export class HomePage implements OnInit {
  public activeSensors = 0;
  public expectedSensors = 0;
  public usersCount = 0;
  patients$!: Observable<string[]>;
  showGraphModal = false;
  x_axis_label = 'Time';
  y_axis_label = 'Accelerometer Absolute Value';
  x_values: any[] = [];
  y_values: any[] = [];
  
  // Downsample slider
  downsampleRate = 100;
  uwbSliderValue = 50;
  rawTimeData: any[] = [];
  rawAbsData: any[] = [];
  isUwbData = false;
  graphHeading = 'Time vs Accelerometer Absolute Value'; // Add this property

  // Data points metrics
  public dataPointsTotal = 0;
  public dataPointsRecentPercent = 0;
  public allShimmers: string[] = [];

  // New: unregistered devices count
  public unregisteredCount = 0;

  // Filter from URL query parameter
  public filterValue: string | null = null;

  
    lineChartData: ChartConfiguration<'line'>['data'] = {
  labels: [],
  datasets: [
    {
      data: [],
      label: 'Abs(Y)',
      fill: false,
      borderColor: 'rgb(75, 192, 192)',
      tension: 0.4, // smoother line
      pointRadius: 0, // hide dots
      pointHoverRadius: 0 // hide dots on hover
    }
  ]
};

  lineChartOptions: ChartConfiguration<'line'>['options'] = {
    responsive: true,
    plugins: {
      legend: { display: true },
    },
    elements: {
      point: {
        radius: 0,
        hoverRadius: 0
      },
      line: {
        tension: 0.4 // smoother line
      }
    },
    scales: {
      x: {
        display: false
      },
      y: {
        title: { display: true, text: this.y_axis_label },
        min: 0,
        max: 25
      }
    }
  };

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private api: ApiService, 
    private cdr: ChangeDetectorRef
  ) {}

  async checkAuth() {
    try {
      const session = await fetchAuthSession();
      const isAuth = session?.tokens?.idToken ? true : false;
      if (!isAuth) this.router.navigate(['/login']);
    } catch {
      this.router.navigate(['/login']);
    }
  }

  private loadActiveSensors() {
    this.patients$ = this.api.listUniquePatients();
    this.api.listUniquePatients().subscribe({
      next: (patients) => {
        const count = Array.isArray(patients) ? patients.length : 0;
        this.usersCount = count;
      },
      error: () => { this.usersCount = 0; }
    });
    
    // Load active sensors from metadata
    this.api.ddbGetDevicePatientMapDetails().subscribe((shimmerRecords) => {
      this.api.listFilesDeconstructed().subscribe((files) => {
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
        this.allShimmers = Array.from(allShimmersSet);
        this.expectedSensors = this.allShimmers.length;
        this.cdr.detectChanges();
        console.log('All shimmers:', this.allShimmers);
        console.log('Active shimmers:', Array.from(activeShimmers));
        console.log('Active sensors count:', this.activeSensors);
      });
    });
  }

  private loadDataPoints() {
    const now = new Date();
    const cutoff = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
    this.api.listFilesMetadata().subscribe({
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

  private loadUnregisteredCount() {
    this.api.getUnregisteredDevices().subscribe({
      next: (list) => {
        this.unregisteredCount = Array.isArray(list) ? list.length : 0;
      },
      error: () => { this.unregisteredCount = 0; }
    });
  }

  ngOnInit(): void {
    this.checkAuth();
    this.loadActiveSensors();
    this.loadDataPoints();
    this.loadUnregisteredCount();
    
    // Read filter from URL query parameter
    this.route.queryParams.subscribe(params => {
      if (params['filter']) {
        this.filterValue = params['filter'];
      } else {
        this.filterValue = null;
      }
    });
  }

  onLogout() {
    console.log('Logout event received from header component');
    // Handle any additional logout logic here
  }

  // openGraphModal(data: { time?: any[]; abs?: any[] }) {
  //   console.log('Graph Button Output:', {
  //     time: data.time,
  //     abs: data.abs
  //   });

  //   this.x_values = Array.isArray(data.time) ? [...data.time] : [];
  //   this.y_values = Array.isArray(data.abs) ? [...data.abs] : [];

  //   // Optionally set modal state if you want to show the arrays in the UI
  //   // this.graphModalData = data;
  //   console.log('Opening graph modal', this.x_values.length, this.y_values.length);
  //   this.showGraphModal = true;
  //   this.cdr.detectChanges();
  // }


  openGraphModal(data: { time?: any[]; abs?: any[]; noDownsample?: boolean }) {
    console.log('Graph Button Output:', {
      time: data.time,
      abs: data.abs,
      timeLength: data.time?.length,
      absLength: data.abs?.length,
      noDownsample: data.noDownsample
    });
    
    // Store raw data
    this.rawTimeData = Array.isArray(data.time) ? [...data.time] : [];
    this.rawAbsData = Array.isArray(data.abs) ? [...data.abs] : [];

    // Set flag to track if this is UWB data
    this.isUwbData = data.noDownsample || false;

    // Set the heading based on graph type
    this.graphHeading = this.isUwbData 
      ? 'Time vs UWB Distance' 
      : 'Time vs Accelerometer Absolute Value';

    // For UWB, decouple slider and chart initial values
    if (this.isUwbData) {
      this.downsampleRate = 100; // Chart starts at 100
      this.uwbSliderValue = 50;  // Slider starts at 50
      this.x_values = this.rawTimeData;
      this.y_values = this.rawAbsData;
      this.updateChartDataDirect();

    } else {
      this.downsampleRate = 100;
      this.updateChartData();
    }

    this.showGraphModal = true;
    this.cdr.detectChanges();
  }

  // Called when UWB slider is moved
  onUwbSliderChange() {
    this.downsampleRate = this.uwbSliderValue;
    this.updateChartDataDirect();
  }

  updateChartData() {
    // Downsample the data
    this.x_values = this.rawTimeData.filter((_, index) => index % this.downsampleRate === 0);
    this.y_values = this.rawAbsData.filter((_, index) => index % this.downsampleRate === 0);

    console.log('Processed values:', {
      x_values: this.x_values.length,
      y_values: this.y_values.length,
      downsampleRate: this.downsampleRate
    });

    // Fixed Y-axis range for accelerometer data: -25 to 25
    this.lineChartData = {
      labels: this.x_values.length ? this.x_values : ['No Data'],
      datasets: [
        {
          data: this.y_values.length ? this.y_values : [0],
          label: 'Abs(Y)',
          fill: false,
          borderColor: 'rgb(75, 192, 192)',
          tension: 0.4,
          pointRadius: 0,
          pointHoverRadius: 0
        }
      ]
    };

    this.lineChartOptions = {
      responsive: true,
      plugins: {
        legend: { display: true },
      },
      elements: {
        point: {
          radius: 0,
          hoverRadius: 0
        },
        line: {
          tension: 0.4
        }
      },
      scales: {
        x: {
          display: false
        },
        y: {
          title: { display: true, text: this.y_axis_label },
          min: 0,
          max: 25
        }
      }
    };

    this.cdr.detectChanges();
  }

  updateChartDataDirect() {
    // Apply light downsampling for UWB data (1-200 range)
    this.x_values = this.rawTimeData.filter((_, index) => index % this.downsampleRate === 0);
    this.y_values = this.rawAbsData.filter((_, index) => index % this.downsampleRate === 0);

    console.log('UWB data with light downsampling:', {
      x_values: this.x_values.length,
      y_values: this.y_values.length,
      downsampleRate: this.downsampleRate
    });

    // Calculate dynamic Y-axis range for UWB data
    const yValues = this.y_values.filter(v => v != null && !isNaN(v));
    let minY = Math.min(...yValues);
    let maxY = Math.max(...yValues);
    const padding = (maxY - minY) * 0.1;
    minY = Math.max(0, minY - padding);
    maxY = maxY + padding;
    if (maxY - minY < 1) {
      const center = (maxY + minY) / 2;
      minY = Math.max(0, center - 0.5);
      maxY = center + 0.5;
    }

    this.lineChartData = {
      labels: this.x_values.length ? this.x_values : ['No Data'],
      datasets: [
        {
          data: this.y_values.length ? this.y_values : [0],
          label: 'UWB Distance',
          fill: false,
          borderColor: 'rgb(16, 185, 129)',
          tension: 0.4,
          pointRadius: 0,
          pointHoverRadius: 0
        }
      ]
    };

    this.lineChartOptions = {
      responsive: true,
      plugins: {
        legend: { display: true },
      },
      elements: {
        point: {
          radius: 0,
          hoverRadius: 0
        },
        line: {
          tension: 0.4
        }
      },
      scales: {
        x: {
          display: false
        },
        y: {
          title: { display: true, text: 'UWB Distance' },
          min: minY,
          max: maxY
        }
      }
    };

    this.cdr.detectChanges();
  }

  closeModal() { 
    this.showGraphModal = false; 
    this.cdr.detectChanges();
  }

}
