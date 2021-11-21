import styles from "./index.less";
import Console from "@/components/console";
import {KeyboardEvent, memo, useEffect, useRef, useState} from "react";
import {Button, Input} from "antd";
import {CloseCircleOutlined, EnterOutlined, LoadingOutlined, ClearOutlined, CloseOutlined, RightOutlined} from "@ant-design/icons";
import StringUtil from "@/common/StringUtil";
import CommonNotice from "@/common/CommonNotice";
import {WsManager} from "@/common/WsManager";
import DashboardView from "@/components/servers/view/DashboardView";
import JadView from "@/components/servers/view/JadView";
import HeapDumpView from "@/components/servers/view/HeapDumpView";
import {useIntl} from "umi";
import {JarBootConst} from "@/common/JarBootConst";
import {PUB_TOPIC, pubsub} from "@/components/servers";

/**
 * 服务的多功能面板，控制台输出、命令执行结果渲染
 * @author majianzheng
 */

interface SuperPanelProps {
    server: string;
    sid: string;
    visible: boolean;
}

/**
 * 执行记录，上下键
 */
interface HistoryProp {
    /** 当前的游标 */
    cur: number;
    /** 历史记录存储 */
    history: string[];
}

const MAX_HISTORY = 100;
const historyMap = new Map<string, HistoryProp>();

const SuperPanel = memo((props: SuperPanelProps) => { //NOSONAR
    const intl = useIntl();
    const [view, setView] = useState('');
    const [executing, setExecuting] = useState(false);
    const [command, setCommand] = useState("");
    const [data, setData] = useState({});
    const inputRef = useRef<any>();
    const key = props.sid;

    useEffect(() => {
        pubsub.submit(key, PUB_TOPIC.CMD_END, onCmdEnd);
        pubsub.submit(key, PUB_TOPIC.RENDER_JSON, renderView);
        pubsub.submit(key, PUB_TOPIC.QUICK_EXEC_CMD, onExecQuickCmd);
        pubsub.submit(key, PUB_TOPIC.FOCUS_CMD_INPUT, onFocusCommandInput);
        historyMap.set(key, new class implements HistoryProp {
            cur = 0;
            history = [];
        });
        return () => {
            pubsub.unSubmit(key, PUB_TOPIC.CMD_END, onCmdEnd);
            pubsub.unSubmit(key, PUB_TOPIC.RENDER_JSON, renderView);
            pubsub.unSubmit(key, PUB_TOPIC.QUICK_EXEC_CMD, onExecQuickCmd);
            pubsub.unSubmit(key, PUB_TOPIC.FOCUS_CMD_INPUT, onFocusCommandInput);
        };
    }, []);

    const historyProp = historyMap.get(key);

    //解析json数据的视图
    const viewResolver: any = {
        'dashboard': <DashboardView data={data}/>,
        'jad': <JadView data={data}/>,
        'heapdump': <HeapDumpView data={data}/>,
    };

    const renderView = (resultData: any) => {
        const cmd = resultData.name;
        if (cmd !== view) {
            setView(cmd);
        }
        setData(resultData);
    };

    const onExecQuickCmd = (cmd: string) => {
        if (inputRef?.current?.props?.disabled) {
            CommonNotice.info(intl.formatMessage({id: 'COMMAND_RUNNING'}, {command: inputRef.current.state?.value}));
            return;
        }
        if (StringUtil.isEmpty(cmd)) {
            return;
        }
        setCommand(cmd);
        doExecCommand(cmd);
    };

    const onFocusCommandInput = () => inputRef?.current?.focus()

    useEffect(onFocusCommandInput, [props.visible]);

    const onCmdEnd = (msg?: string) => {
        setExecuting(false);
        pubsub.publish(key, JarBootConst.FINISH_LOADING, msg);
        inputRef?.current?.focus();
        const value = inputRef?.current?.state?.value;
        if (value && value?.length > 0) {
            inputRef.current.setSelectionRange(0, value.length);
        }
    };

    const clearDisplay = () => {
        pubsub.publish(key, JarBootConst.CLEAR_CONSOLE);
        inputRef?.current?.focus();
    };

    const closeView = () => {
        if (executing) {
            CommonNotice.info(intl.formatMessage({id: 'COMMAND_RUNNING'}, {command}));
            return;
        }
        if ('' !== view) {
            //切换为控制台显示
            setView('');
        }
        inputRef?.current?.focus();
    };

    const doExecCommand = (cmd: string) => {
        if (StringUtil.isEmpty(cmd)) {
            return;
        }
        if (StringUtil.isEmpty(props.sid)) {
            CommonNotice.info(intl.formatMessage({id: 'SELECT_ONE_SERVER_INFO'}));
            return;
        }

        setExecuting(true);
        if ('' !== view) {
            //切换为控制台显示
            setView('');
        }
        pubsub.publish(key, JarBootConst.APPEND_LINE, `<span class="${styles.commandPrefix}">$</span>${cmd}`);
        const msg = {server: props.server, sid: props.sid, body: cmd, func: 1};
        WsManager.sendMessage(JSON.stringify(msg));

        if (historyProp) {
            const history = historyProp.history;
            if (history.length > 0 && history[history.length - 1] === cmd) {
                return;
            }
            history.push(cmd);
            if (history.length > MAX_HISTORY) {
                history.shift();
            }
            historyProp.cur = history.length - 1;
        }
    };

    const onExecCommand = () => {
        doExecCommand(command);
    };

    const onCancelCommand = () => {
        if (StringUtil.isEmpty(props.sid)) {
            CommonNotice.info(intl.formatMessage({id: 'SELECT_ONE_SERVER_INFO'}));
            return;
        }
        const msg = {server: props.server, sid: props.sid, body: '', func: 2};
        WsManager.sendMessage(JSON.stringify(msg));
    };

    const onKeyUp = (e: KeyboardEvent) => {
        if ('ArrowUp' === e.key && historyProp) {
            const history = historyProp.history;
            historyProp.cur--;
            if (historyProp.cur < 0) {
                historyProp.cur = 0;
                return;
            }
            const value = history[historyProp.cur];
            if (value) {
                setCommand(value);
            }
            return;
        }
        if ('ArrowDown' === e.key && historyProp) {
            const history = historyProp.history;
            historyProp.cur++;
            if (historyProp.cur >= history.length) {
                historyProp.cur = history.length - 1;
                return;
            }
            const value = history[historyProp.cur];
            if (value) {
                setCommand(value);
            }
        }
    };

    const commandInput = () => (
            <Input onPressEnter={onExecCommand}
                   onKeyUp={onKeyUp}
                   ref={inputRef}
                   className={styles.commandInput}
                   disabled={executing}
                   placeholder={intl.formatMessage({id: 'COMMAND_PLACEHOLDER'})}
                   autoComplete={"off"}
                   autoCorrect="off"
                   autoCapitalize="off"
                   spellCheck="false"
                   style={{width: '100%'}}
                   onChange={event => setCommand(event.target.value)}
                   value={command}
                   prefix={<RightOutlined />}
                   suffix={executing ? <LoadingOutlined/> : <EnterOutlined onClick={onExecCommand}/>}
            />);

    const extraButton = () => {
        let extra;
        if (executing) {
            extra = <Button type={"dashed"}
                            icon={<CloseCircleOutlined />}
                            size={"small"}
                            ghost danger
                            onClick={onCancelCommand}>{intl.formatMessage({id: 'CANCEL'})}</Button>;
        } else if ('' === view) {
            extra = <Button type={"dashed"}
                            icon={<ClearOutlined />}
                            size={"small"}
                            ghost
                            onClick={clearDisplay}>{intl.formatMessage({id: 'CLEAR'})}</Button>;
        } else {
            extra = <Button type={"dashed"}
                            icon={<CloseOutlined />}
                            size={"small"}
                            ghost danger
                            onClick={closeView}>{intl.formatMessage({id: 'CLOSE'})}</Button>;
        }
        return (<div className={styles.consoleExtra}>{extra}</div>);
    }
    return (
        <div style={{display: props.visible ? 'block' : 'none'}}>
            <div className={styles.outPanel} style={{height: JarBootConst.PANEL_HEIGHT}}>
                <Console id={key}
                         visible={'' === view}
                         pubsub={pubsub}/>
                {'' !== view && viewResolver[view]}
            </div>
            {extraButton()}
            {commandInput()}
        </div>);
});

export {SuperPanel};
