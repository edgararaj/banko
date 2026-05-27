import Image from "next/image";
import CSVImport from './components/CSVImport';
import CalendarHeatmap from './components/CalendarHeatmap';
import { Card, CardContent, Stack, Typography, Box } from '@mui/material';

export default function Home() {
  return (
    <Box sx={{ p: 2 }}>
      <div className="w-full flex flex-col gap-6 md:flex-row md:items-start">
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} className="w-full">
          <Typography variant="h5" sx={{ mb: 1 }}>Welcome, Edgar!</Typography>
          <Card sx={{ flex: 2 }} variant="outlined">
            <CardContent>
              <Typography variant="h6" sx={{ mb: 1 }}>Money Heatmap</Typography>
              <Box>
                <CalendarHeatmap />
              </Box>
            </CardContent>
          </Card>

          <Card sx={{ flex: 1 }} variant="outlined">
            <CardContent>
              <Typography variant="h6" sx={{ mb: 1 }}>Import Transactions</Typography>
              <CSVImport />
              <Typography className="small-muted" sx={{ mt: 2 }}>All processing happens locally in your browser (IndexedDB).</Typography>
            </CardContent>
          </Card>
        </Stack>
      </div>
    </Box>

  );
}
