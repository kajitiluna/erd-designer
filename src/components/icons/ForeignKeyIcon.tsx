import VpnKeyIcon from '@mui/icons-material/VpnKey';
import KeyColor from '~/components/icons/KeyColor';

const ForeignKeyIcon = ({ fontScale = 1 }: { fontScale?: number }) => {
    return (
        <VpnKeyIcon fontSize="small" sx={{
            color: KeyColor.foreign,
            transform: 'scaleX(-1) rotate(45deg)',
            fontSize: `${fontScale * 100}%`
        }} />
    );
};

export default ForeignKeyIcon;
