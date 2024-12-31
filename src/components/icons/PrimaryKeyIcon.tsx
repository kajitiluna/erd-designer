import VpnKeyIcon from '@mui/icons-material/VpnKey';
import KeyColor from '~/components/icons/KeyColor';

const PrimaryKeyIcon = ({ fontScale = 1 }: { fontScale?: number }) => {
    return (
        <VpnKeyIcon fontSize="small" sx={{
            color: KeyColor.primary,
            transform: 'scaleX(-1) rotate(45deg)',
            fontSize: `${fontScale * 100}%`
        }} />
    );
};

export default PrimaryKeyIcon;
